// The solo games' leaderboards: today's top ten (Brazil's day) and the all-time top ten, per game, kept in
// a JSON file on the server's volume (DATA_DIR) so they survive deploys.
//
// Scores come from the browser, where the games run, so they cannot be proven; they are made hard to fake.
// A game asks for a run ticket when it opens (signed here, with when it was issued); a score needs one,
// must be possible in the time since (each game has a ceiling of points per second), and each address may
// send only a few per minute. Names are cleaned like everywhere else.
//
//   GET  /api/scores?game=snake   → { today: Entry[], all: Entry[] }
//   POST /api/run    { game }     → { run }
//   POST /api/scores { game, run, name, score } → { today: rank | null, all: rank | null }
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { cleanName } from "../src/games/protocol.ts";

/** The games with a leaderboard, and the most points a second each can plausibly make (with room). */
const GAMES: Record<string, number> = {
  snake: 60,
  "snake-easy": 60,
  invaders: 400,
  tetris: 400,
};
const TOP = 10;
const PER_MINUTE = 12;

export interface Entry {
  name: string;
  score: number;
  /** When it was set (ISO). */
  at: string;
}
type Board = { day: string; today: Entry[]; all: Entry[] };

const dir = process.env.DATA_DIR ?? "data";
const file = join(dir, "scores.json");
/** Signs run tickets; a new one each time the server starts (an open game then simply cannot submit). */
const key = randomBytes(32);

let boards: Record<string, Board> = {};
try {
  boards = JSON.parse(readFileSync(file, "utf8"));
} catch {
  // No file yet: empty boards.
}

/** Today in Brazil, as YYYY-MM-DD: the day the "today" board belongs to. */
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );

function board(game: string): Board {
  const day = today();
  const b = (boards[game] ??= { day, today: [], all: [] });
  if (b.day !== day) Object.assign(b, { day, today: [] });
  return b;
}

/** Written to a temporary file and renamed over the old one, so a crash never leaves half a file. */
function save() {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify(boards));
    renameSync(`${file}.tmp`, file);
  } catch (error) {
    console.error("scores: could not save", error);
  }
}

/** Puts an entry in a list, best first, keeping one entry per name; returns its place (1-based) or null. */
function place(list: Entry[], entry: Entry): number | null {
  const mine = list.findIndex((e) => e.name === entry.name);
  if (mine >= 0 && list[mine].score >= entry.score) return null;
  if (mine >= 0) list.splice(mine, 1);
  list.push(entry);
  list.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  list.length = Math.min(list.length, TOP);
  const rank = list.indexOf(entry);
  return rank >= 0 ? rank + 1 : null;
}

const sign = (data: string) =>
  createHmac("sha256", key).update(data).digest("base64url");

function ticket(game: string): string {
  const data = `${game}.${Date.now()}.${randomBytes(6).toString("base64url")}`;
  return `${data}.${sign(data)}`;
}

/** The ticket's issue time, if it is genuine and for this game. */
function checkTicket(run: string, game: string): number | null {
  const cut = run.lastIndexOf(".");
  if (cut < 0) return null;
  const data = run.slice(0, cut);
  const mac = Buffer.from(run.slice(cut + 1));
  const good = Buffer.from(sign(data));
  if (mac.length !== good.length || !timingSafeEqual(mac, good)) return null;
  const [g, issued] = data.split(".");
  return g === game && Number.isFinite(Number(issued)) ? Number(issued) : null;
}

const sent = new Map<string, number[]>();
/** At most PER_MINUTE submissions a minute per address. */
function allowed(address: string): boolean {
  const now = Date.now();
  const recent = (sent.get(address) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= PER_MINUTE) return false;
  recent.push(now);
  sent.set(address, recent);
  return true;
}

function reply(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(data);
}

/** Reads a small JSON body (up to 1 KB). */
function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > 1024) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(v && typeof v === "object" ? v : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

/** Handles /api/scores and /api/run; false for any other path. `address` is the visitor's. */
export function handleScores(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  address: string,
): boolean {
  if (path !== "/api/scores" && path !== "/api/run") return false;
  void (async () => {
    if (path === "/api/scores" && req.method === "GET") {
      const game =
        new URL(req.url ?? "/", "http://x").searchParams.get("game") ?? "";
      if (!(game in GAMES)) return reply(res, 400, { error: "game" });
      const b = board(game);
      return reply(res, 200, { today: b.today, all: b.all });
    }
    if (req.method !== "POST") return reply(res, 405, { error: "method" });
    const body = await readJson(req);
    const game = String(body?.game ?? "");
    if (!body || !(game in GAMES)) return reply(res, 400, { error: "game" });
    if (path === "/api/run") return reply(res, 200, { run: ticket(game) });

    const name = cleanName(String(body.name ?? ""));
    const score = Number(body.score);
    const issued = checkTicket(String(body.run ?? ""), game);
    if (!name || !Number.isInteger(score) || score <= 0 || score > 1e7)
      return reply(res, 400, { error: "score" });
    if (issued === null) return reply(res, 400, { error: "run" });
    // Not more than the game allows in the time it has been running.
    const seconds = (Date.now() - issued) / 1000;
    if (score > (seconds + 5) * GAMES[game])
      return reply(res, 400, { error: "score" });
    if (!allowed(address)) return reply(res, 429, { error: "slow down" });

    const entry: Entry = { name, score, at: new Date().toISOString() };
    const b = board(game);
    const result = {
      today: place(b.today, { ...entry }),
      all: place(b.all, { ...entry }),
    };
    if (result.today || result.all) save();
    reply(res, 200, result);
  })().catch((error) => {
    console.error(error);
    if (!res.headersSent) reply(res, 500, { error: "server" });
  });
  return true;
}
