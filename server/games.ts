// The game WebSocket (/ws): the public Snake arena and the co-op Space Invaders rooms. Attached to an
// HTTP server: the production one (server/index.ts) and, in development, Vite's (vite.config.ts), so
// `pnpm dev` plays online without a second process.
import type { Server } from "node:http";
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
  const MESSAGES_PER_SECOND = 40;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });

  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") {
      if (exclusive) socket.destroy();
      return;
    }
    if (wss.clients.size >= MAX_CONNECTIONS) {
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
}
