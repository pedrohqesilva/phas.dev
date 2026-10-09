// Tetris versus rooms. Each browser runs its own game (tetris-sim.ts); the server starts both on the same
// seed (same pieces), passes each player's board to the other a few times a second, turns line clears into
// garbage for the other player, and calls the winner when one tops out. After a match, both press to play
// again. A page can only hurt its own game, so the checks here are about shape and pace.
import { randomInt } from "node:crypto";
import { COLS } from "../src/games/tetris-sim.ts";
import type { ServerMessage } from "../src/games/protocol.ts";
import { createRooms } from "./rooms.ts";

interface Match {
  over: boolean;
  again: [boolean, boolean];
  /** Last board relayed per player (time), to keep the pace at about 10 a second. */
  lastBoard: [number, number];
}

const BOARD = /^[0-8]{200}$/;

export function createTetrisRooms() {
  const rooms = createRooms<ServerMessage, Match>(
    {
      room: (room, you, players, token) => ({
        t: "tetris.room",
        room,
        you,
        players,
        token,
      }),
      away: () => ({ t: "tetris.away" }),
      back: () => ({ t: "tetris.back" }),
      left: () => ({ t: "tetris.left" }),
      error: (reason) => ({ t: "tetris.error", reason }),
    },
    {
      start(room) {
        rooms.broadcast(room, { t: "tetris.start", seed: randomInt(2 ** 31) });
        return { over: false, again: [false, false], lastBoard: [0, 0] };
      },
      stop() {},
    },
  );

  const other = (code: string, you: number) =>
    rooms.get(code)?.players[1 - you];

  return {
    create: (send: (m: ServerMessage) => void, listed = false) =>
      rooms.create(send, listed),
    list: () => rooms.list(),
    quick: (send: (m: ServerMessage) => void) => rooms.quick(send),
    join: (code: string, send: (m: ServerMessage) => void, resume?: string) =>
      rooms.join(code, send, resume),
    ready: (code: string, you: number) => rooms.ready(code, you),
    leave: (code: string, you: number) => rooms.leave(code, you),
    board(
      code: string,
      you: number,
      cells: unknown,
      score: unknown,
      lines: unknown,
    ) {
      const m = rooms.get(code)?.game;
      if (!m || m.over || typeof cells !== "string" || !BOARD.test(cells))
        return;
      const now = Date.now();
      if (now - m.lastBoard[you] < 80) return;
      m.lastBoard[you] = now;
      other(
        code,
        you,
      )?.({
        t: "tetris.opponent",
        cells,
        score: Number.isInteger(score) ? (score as number) : 0,
        lines: Number.isInteger(lines) ? (lines as number) : 0,
      });
    },
    attack(code: string, you: number, lines: unknown) {
      const m = rooms.get(code)?.game;
      if (
        !m ||
        m.over ||
        !Number.isInteger(lines) ||
        (lines as number) < 1 ||
        (lines as number) > 4
      )
        return;
      other(
        code,
        you,
      )?.({
        t: "tetris.garbage",
        lines: lines as number,
        hole: randomInt(COLS),
      });
    },
    over(code: string, you: number) {
      const room = rooms.get(code);
      const m = room?.game;
      if (!room || !m || m.over) return;
      m.over = true;
      room.players[you]?.({ t: "tetris.result", won: false });
      room.players[1 - you]?.({ t: "tetris.result", won: true });
    },
    again(code: string, you: number) {
      const room = rooms.get(code);
      const m = room?.game;
      if (!room || !m || !m.over) return;
      m.again[you] = true;
      if (m.again.every(Boolean)) {
        Object.assign(m, { over: false, again: [false, false] });
        rooms.broadcast(room, { t: "tetris.start", seed: randomInt(2 ** 31) });
      }
    },
  };
}
