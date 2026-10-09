// Space Invaders versus rooms: the match runs here (invaders-versus-sim.ts), 60 steps a second, with a
// snapshot to both players every other step. Like co-op, each browser moves its own ship at once and
// reports where it is, how fast it is going (0 the moment it stops) and whether fire is held; the server
// follows at a capped speed, and bombs and shots are checked against where each ship is on its player's
// screen right now. After a win, both players press to play again.
import { idleInput, W, type ShipInput } from "../src/games/invaders-sim.ts";
import {
  createVersus,
  restartVersus,
  stepVersus,
  viewVersus,
  type VersusState,
} from "../src/games/invaders-versus-sim.ts";
import type { ServerMessage } from "../src/games/protocol.ts";
import { createRooms, type Room } from "./rooms.ts";
import { startTicker } from "./ticker.ts";

const STEP_MS = 16;
const SEND_EVERY = 2;
/** Above the fastest a ship moves in the browser (a finger, 140 per second), but capped. */
const FOLLOW_SPEED = 260;
const MAX_SHIP_SPEED = 140;
const MAX_PROJECT_MS = 200;

type Report = { x: number; vx: number; oneWay: number; at: number };
interface Match {
  st: VersusState;
  clock: number;
  inputs: [ShipInput, ShipInput];
  reports: (Report | null)[];
  again: [boolean, boolean];
  stop: () => void;
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function createInvadersVersus() {
  const rooms = createRooms<ServerMessage, Match>(
    {
      room: (room, you, players, token) => ({
        t: "invaders.room",
        room,
        you,
        players,
        token,
      }),
      away: () => ({ t: "invaders.away" }),
      back: () => ({ t: "invaders.back" }),
      left: () => ({ t: "invaders.left" }),
      error: (reason) => ({ t: "invaders.error", reason }),
    },
    {
      start(room) {
        rooms.broadcast(room, { t: "invaders.start" });
        let n = 0;
        const match: Match = {
          st: createVersus(0),
          clock: 0,
          inputs: [idleInput(), idleInput()],
          reports: [null, null],
          again: [false, false],
          stop: startTicker(
            STEP_MS,
            () => {
              step(match);
              if (++n % SEND_EVERY === 0)
                rooms.broadcast(room, {
                  t: "invaders.state",
                  view: viewVersus(match.st, match.clock),
                });
            },
            () => rooms.paused(room),
          ),
        };
        return match;
      },
      stop: (match) => match.stop(),
      resumed: (room, seat) =>
        room.game && room.players[seat]?.({ t: "invaders.start" }),
    },
  );

  function step(m: Match) {
    const wall = performance.now();
    m.reports.forEach((r, i) => {
      const ship = m.st.players[i].ship;
      if (!r) return;
      const max = (FOLLOW_SPEED * STEP_MS) / 1000;
      ship.x += clamp(r.x - ship.x, -max, max);
      // Hits are checked where the ship is on its player's screen now: the report carried forward.
      const ahead = Math.min(MAX_PROJECT_MS, r.oneWay + (wall - r.at));
      ship.hitX = clamp(r.x + (r.vx * ahead) / 1000, 8, W - 8);
    });
    m.clock += STEP_MS;
    stepVersus(m.st, m.inputs, m.clock, STEP_MS);
  }

  return {
    create: (send: (m: ServerMessage) => void) => rooms.create(send),
    join: (code: string, send: (m: ServerMessage) => void, resume?: string) =>
      rooms.join(code, send, resume),
    ready: (code: string, you: number) => rooms.ready(code, you),
    leave: (code: string, you: number) => rooms.leave(code, you),
    /** A ship report: where it is, its speed and the fire button; anything malformed is ignored. */
    input(code: string, you: number, raw: unknown) {
      const m = rooms.get(code)?.game;
      const r = (raw ?? {}) as Record<string, unknown>;
      if (!m || !finite(r.x)) return;
      m.inputs[you] = { ...idleInput(), fire: r.fire === true };
      m.reports[you] = {
        x: clamp(r.x, 8, W - 8),
        vx: finite(r.vx) ? clamp(r.vx, -MAX_SHIP_SPEED, MAX_SHIP_SPEED) : 0,
        oneWay: finite(r.rtt) ? clamp(r.rtt / 2, 0, 150) : 0,
        at: performance.now(),
      };
    },
    /** After a win: once both press, a new match. */
    again(code: string, you: number) {
      const room: Room<ServerMessage, Match> | undefined = rooms.get(code);
      const m = room?.game;
      if (!room || !m || m.st.winner === null) return;
      m.again[you] = true;
      if (m.again.every(Boolean)) {
        restartVersus(m.st, m.clock);
        m.again = [false, false];
        rooms.broadcast(room, { t: "invaders.start" });
      }
    },
  };
}
