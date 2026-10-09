// Pong 1v1 rooms: the match runs here (pong-sim.ts), 60 steps a second, with a snapshot to both players
// every other step. Each browser moves its own paddle at once and reports where it is and how fast it is
// going (0 the moment it stops); the server follows at a capped speed and checks the ball against where
// each paddle is on its player's screen right now: anywhere between the last report and that report
// carried forward by its speed, so a save you see is a save. After a win, both players press to play
// again.
import {
  clampPaddle,
  createPong,
  H,
  stepBall,
  viewPong,
  type PongState,
} from "../src/games/pong-sim.ts";
import type { ServerMessage } from "../src/games/protocol.ts";
import { createRooms, type Room } from "./rooms.ts";
import { startTicker } from "./ticker.ts";

const STEP_MS = 16;
const SEND_EVERY = 2;
/** Above the fastest a paddle moves in the browser (a finger can be quick), but capped. */
const FOLLOW_SPEED = 900;
const MAX_PROJECT_MS = 200;
/** Leeway on top of the span, for the frames between a report and the next. */
const SLACK = 3;

type Report = { y: number; vy: number; oneWay: number; at: number };
interface Match {
  st: PongState;
  clock: number;
  reports: (Report | null)[];
  again: [boolean, boolean];
  stop: () => void;
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

export function createPongRooms() {
  const rooms = createRooms<ServerMessage, Match>(
    {
      room: (room, you, players, token) => ({
        t: "pong.room",
        room,
        you,
        players,
        token,
      }),
      away: () => ({ t: "pong.away" }),
      back: () => ({ t: "pong.back" }),
      left: () => ({ t: "pong.left" }),
      error: (reason) => ({ t: "pong.error", reason }),
    },
    {
      start(room) {
        rooms.broadcast(room, { t: "pong.start" });
        let n = 0;
        const match: Match = {
          st: createPong(0),
          clock: 0,
          reports: [null, null],
          again: [false, false],
          stop: startTicker(
            STEP_MS,
            () => {
              step(match);
              if (++n % SEND_EVERY === 0)
                rooms.broadcast(room, {
                  t: "pong.state",
                  view: viewPong(match.st, match.clock),
                });
            },
            () => rooms.paused(room),
          ),
        };
        return match;
      },
      stop: (match) => match.stop(),
      resumed: (room, seat) =>
        room.game && room.players[seat]?.({ t: "pong.start" }),
    },
  );

  function step(m: Match) {
    const wall = performance.now();
    const hitAt: [number, number] = [m.st.paddles[0], m.st.paddles[1]];
    const reach: [number, number] = [0, 0];
    m.reports.forEach((r, i) => {
      if (!r) return;
      const max = (FOLLOW_SPEED * STEP_MS) / 1000;
      m.st.paddles[i] = clampPaddle(
        m.st.paddles[i] + Math.max(-max, Math.min(max, r.y - m.st.paddles[i])),
      );
      // From the last report to where it would be by now at that speed: the player may have stopped
      // anywhere on the way.
      const ahead = Math.min(MAX_PROJECT_MS, r.oneWay + (wall - r.at));
      const to = clampPaddle(r.y + (r.vy * ahead) / 1000);
      hitAt[i] = (r.y + to) / 2;
      reach[i] = Math.abs(to - r.y) / 2 + SLACK;
    });
    m.clock += STEP_MS;
    stepBall(m.st, m.clock, STEP_MS, hitAt, reach);
  }

  return {
    create: (send: (m: ServerMessage) => void) => rooms.create(send),
    join: (code: string, send: (m: ServerMessage) => void, resume?: string) =>
      rooms.join(code, send, resume),
    ready: (code: string, you: number) => rooms.ready(code, you),
    leave: (code: string, you: number) => rooms.leave(code, you),
    input(code: string, you: number, y: unknown, vy: unknown, rtt: unknown) {
      const m = rooms.get(code)?.game;
      if (!m || !finite(y)) return;
      const at = performance.now();
      const ny = clampPaddle(Math.max(0, Math.min(H, y)));
      // The speed the page says (0 once it stopped), within what a paddle can do. Claiming another gains
      // nothing a claimed place would not: the place is the player's already.
      const speed = finite(vy) ? Math.max(-900, Math.min(900, vy)) : 0;
      m.reports[you] = {
        y: ny,
        vy: speed,
        oneWay: finite(rtt) ? Math.max(0, Math.min(150, rtt / 2)) : 0,
        at,
      };
    },
    /** After a win: once both press, a new match. */
    again(code: string, you: number) {
      const room: Room<ServerMessage, Match> | undefined = rooms.get(code);
      const m = room?.game;
      if (!room || !m || m.st.winner === null) return;
      m.again[you] = true;
      if (m.again.every(Boolean)) {
        m.st = createPong(m.clock);
        m.again = [false, false];
        rooms.broadcast(room, { t: "pong.start" });
      }
    },
  };
}
