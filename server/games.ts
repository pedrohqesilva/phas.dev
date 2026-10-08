// The game WebSocket (/ws): the public Snake arena and the co-op Space Invaders rooms. Attached to an
// HTTP server: the production one (server/index.ts) and, in development, Vite's (vite.config.ts), so
// `pnpm dev` plays online without a second process.
import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import {
  cleanName,
  isRoomCode,
  type ClientMessage,
  type Dir,
  type ServerMessage,
} from "../src/games/protocol.ts";
import { createArena } from "./arena.ts";
import { createCoop } from "./coop.ts";
import { fromCloudflare } from "./origin.ts";

/**
 * `exclusive`: this server owns every upgrade, so anything but /ws is refused. Off under Vite, whose own
 * hot-reload socket shares the server.
 */
export function attachGames(server: Server, { exclusive = true } = {}) {
  const arena = createArena();
  const coop = createCoop();

  /** What one connection is doing: at most one arena seat and one co-op seat. */
  interface Session {
    arenaId: number | null;
    room: { code: string; you: number } | null;
    /** Messages this second, for a simple rate limit. */
    budget: number;
    alive: boolean;
  }

  const MAX_CONNECTIONS = 300;
  /** One person (one address) cannot take all the seats: a few tabs are plenty. */
  const MAX_PER_ADDRESS = 8;
  const perAddress = new Map<string, number>();
  /**
   * Pages allowed to open the game socket: this site (and local development). Browsers send the page's
   * origin and other sites cannot fake it; a request with no origin is not a browser and gains nothing.
   */
  const allowedOrigin = (origin: string | undefined) =>
    !origin ||
    /^https:\/\/(www\.)?phas\.dev$/.test(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  /** The visitor's address: Cloudflare's header first, then the proxy chain, then the socket. */
  const addressOf = (req: IncomingMessage) => {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf) return cf;
    const chain = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")[0]
      .trim();
    return chain || req.socket.remoteAddress || "?";
  };
  // Co-op reports the ship's position up to 30 times a second, plus fire presses and pings.
  const MESSAGES_PER_SECOND = 60;
  /**
   * Development only: GAME_LAG_MS delays every message both ways, to play here as it plays from far away
   * (e.g. GAME_LAG_MS=80 is about Brazil to the server in Virginia).
   */
  const lag = Number(process.env.GAME_LAG_MS ?? 0);
  const later = (fn: () => void) => (lag > 0 ? setTimeout(fn, lag) : fn());

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") {
      if (exclusive) socket.destroy();
      return;
    }
    const address = addressOf(req);
    if (
      !fromCloudflare(req) ||
      !allowedOrigin(req.headers.origin) ||
      wss.clients.size >= MAX_CONNECTIONS ||
      (perAddress.get(address) ?? 0) >= MAX_PER_ADDRESS
    ) {
      socket.destroy();
      return;
    }
    perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    wss.handleUpgrade(req, socket, head, (ws) => {
      // A broken or oversized frame is that connection's problem: an "error" with no listener would
      // crash the whole process.
      ws.on("error", () => ws.terminate());
      ws.once("close", () => {
        const n = (perAddress.get(address) ?? 1) - 1;
        if (n > 0) perAddress.set(address, n);
        else perAddress.delete(address);
      });
      wss.emit("connection", ws);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const session: Session = {
      arenaId: null,
      room: null,
      budget: MESSAGES_PER_SECOND,
      alive: true,
    };
    const send = (msg: ServerMessage) => {
      const data = JSON.stringify(msg);
      // A slow client that falls behind skips snapshots instead of growing a backlog.
      later(() => {
        if (ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024)
          ws.send(data);
      });
    };
    const refill = setInterval(
      () => (session.budget = MESSAGES_PER_SECOND),
      1000,
    );

    ws.on("pong", () => (session.alive = true));
    // A message that trips a handler is dropped (and logged), never allowed to take the server down.
    ws.on("message", (data) =>
      later(() => {
        try {
          handle(data);
        } catch (error) {
          console.error(error);
        }
      }),
    );
    const handle = (data: unknown) => {
      if (--session.budget < 0) return;
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      switch (msg?.t) {
        case "ping":
          if (typeof msg.n === "number") send({ t: "pong", n: msg.n });
          break;
        case "arena.join":
          if (session.arenaId === null) {
            const id = arena.join(
              cleanName(String(msg.name ?? "")) ||
                `anon${Math.floor(Math.random() * 900 + 100)}`,
              send,
              typeof msg.resume === "string" ? msg.resume : undefined,
            );
            if (id === null) send({ t: "arena.full" });
            else session.arenaId = id;
          }
          break;
        case "arena.dir":
          if (session.arenaId !== null && [0, 1, 2, 3].includes(msg.dir))
            arena.turn(
              session.arenaId,
              msg.dir as Dir,
              Number.isFinite(msg.seq) ? msg.seq : 0,
              Number.isFinite(msg.at) ? msg.at : 0,
            );
          break;
        case "coop.create":
          if (!session.room) session.room = coop.create(send);
          if (!session.room) send({ t: "coop.error", reason: "full" });
          break;
        case "coop.join":
          if (!session.room && isRoomCode(String(msg.room ?? "")))
            session.room = coop.join(
              String(msg.room),
              send,
              typeof msg.resume === "string" ? msg.resume : undefined,
            );
          else if (!session.room)
            send({ t: "coop.error", reason: "not-found" });
          break;
        case "coop.ready":
          if (session.room) coop.ready(session.room.code, session.room.you);
          break;
        case "coop.input":
          if (session.room)
            coop.input(session.room.code, session.room.you, msg.input);
          break;
      }
    };
    ws.on("close", () => {
      clearInterval(refill);
      if (session.arenaId !== null) arena.leave(session.arenaId);
      if (session.room) coop.leave(session.room.code, session.room.you);
    });
    (ws as WebSocket & { session?: Session }).session = session;
  });

  // Heartbeat: a connection that misses a ping is dropped, freeing its arena or room seat.
  setInterval(() => {
    for (const ws of wss.clients) {
      const session = (ws as WebSocket & { session?: Session }).session;
      if (!session) continue;
      if (!session.alive) {
        ws.terminate();
        continue;
      }
      session.alive = false;
      ws.ping();
    }
  }, 25_000);
}
