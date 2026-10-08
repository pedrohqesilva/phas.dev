// phas.dev server: the static site (dist/) and the game WebSocket (/ws) on one port.
// Static files are read once at startup and kept in memory, gzipped when that helps. Hashed assets are
// cached for a year; everything else is revalidated. Unknown paths fall back to index.html, so /simples
// and other client routes work on reload.
import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
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

const PORT = Number(process.env.PORT ?? 8080);
const DIST = resolve(process.env.DIST ?? "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

type File = { body: Buffer; gzip: Buffer | null; type: string };

function loadDist(): Map<string, File> {
  const files = new Map<string, File>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const body = readFileSync(path);
        const type = TYPES[extname(name)] ?? "application/octet-stream";
        const compressible =
          /^(text\/|image\/svg|application\/(json|xml|manifest))/.test(type);
        const gzip = compressible && body.length > 512 ? gzipSync(body) : null;
        files.set(`/${relative(DIST, path).split("\\").join("/")}`, {
          body,
          gzip,
          type,
        });
      }
    }
  };
  try {
    walk(DIST);
  } catch {
    console.warn(
      `no static files at ${DIST} (fine in dev: Vite serves the site)`,
    );
  }
  return files;
}

const files = loadDist();

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  const file =
    files.get(path === "/" ? "/index.html" : path) ?? files.get("/index.html");
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  const gzip =
    file.gzip && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  const body = gzip ? file.gzip! : file.body;
  res.writeHead(200, {
    "Content-Type": file.type,
    "Content-Length": body.length,
    "Cache-Control": path.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    ...(gzip ? { "Content-Encoding": "gzip" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

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
const MESSAGES_PER_SECOND = 40;

const server = createServer(serveStatic);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

server.on("upgrade", (req, socket, head) => {
  if (
    new URL(req.url ?? "/", "http://x").pathname !== "/ws" ||
    wss.clients.size >= MAX_CONNECTIONS
  ) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
});

wss.on("connection", (ws: WebSocket) => {
  const session: Session = {
    arenaId: null,
    room: null,
    budget: MESSAGES_PER_SECOND,
    alive: true,
  };
  const send = (msg: ServerMessage) => {
    // A slow client that falls behind skips snapshots instead of growing a backlog.
    if (ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024)
      ws.send(JSON.stringify(msg));
  };
  const refill = setInterval(
    () => (session.budget = MESSAGES_PER_SECOND),
    1000,
  );

  ws.on("pong", () => (session.alive = true));
  ws.on("message", (data) => {
    if (--session.budget < 0) return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    switch (msg?.t) {
      case "arena.join":
        if (session.arenaId === null) {
          const id = arena.join(
            cleanName(String(msg.name ?? "")) ||
              `anon${Math.floor(Math.random() * 900 + 100)}`,
            send,
          );
          if (id === null) send({ t: "arena.full" });
          else session.arenaId = id;
        }
        break;
      case "arena.dir":
        if (session.arenaId !== null && [0, 1, 2, 3].includes(msg.dir))
          arena.turn(session.arenaId, msg.dir as Dir);
        break;
      case "coop.create":
        if (!session.room) session.room = coop.create(send);
        if (!session.room) send({ t: "coop.error", reason: "full" });
        break;
      case "coop.join":
        if (!session.room && isRoomCode(String(msg.room ?? "")))
          session.room = coop.join(String(msg.room), send);
        else if (!session.room) send({ t: "coop.error", reason: "not-found" });
        break;
      case "coop.ready":
        if (session.room) coop.ready(session.room.code, session.room.you);
        break;
      case "coop.input":
        if (session.room)
          coop.input(session.room.code, session.room.you, msg.input);
        break;
    }
  });
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

server.listen(PORT, () =>
  console.log(`phas.dev on :${PORT} (${files.size} static files)`),
);
