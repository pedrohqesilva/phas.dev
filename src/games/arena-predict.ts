// Plays an arena snake forward from a snapshot, beat by beat, by the server's own rules (server/arena.ts
// and arena-rules.ts), so the browser can show your snake where it will be when your turns reach the
// server. No DOM: also used by the tests.
import { creditPerTick, POWER_TICKS } from "./arena-rules.ts";
import {
  ARENA_COLS,
  ARENA_ROWS,
  DIR_STEP,
  POWER_KINDS,
  type ArenaSnake,
  type ArenaState,
  type Dir,
} from "./protocol.ts";

export const opposite = (a: Dir, b: Dir) => (a + 2) % 4 === b;
/** Same as the server: a turn asking for a beat further ahead than this applies at once. */
export const MAX_LEAD_TICKS = 30;

export interface Predicted {
  body: number[];
  dir: Dir;
  /** The beat of the last step and the cell the tail left then: for the smooth drawing. */
  movedAt: number;
  prevTail: [number, number] | null;
  /** The beat of the next step (after `upTo`), and the beats each power-up still has at `upTo`. */
  nextMoveAt: number;
  boost: number;
  shield: number;
  /** Turns not used yet by `upTo`. */
  waiting: { dir: Dir; at: number }[];
  /** Food and power-up cells eaten on the way. */
  eaten: Set<number>;
}

/** The snake at beat `upTo`: the snapshot's, moved forward with `turns` (those the server has not used). */
export function predict(
  me: ArenaSnake,
  state: ArenaState,
  turns: { dir: Dir; at: number }[],
  upTo: number,
): Predicted {
  const body = [...me.body];
  let { dir, grow, credit, movedAt, prevTail } = me;
  let boostUntil = state.tick + me.boost;
  let shieldUntil = state.tick + me.shield;
  const queue = [...turns];
  const food = new Set<number>();
  for (let i = 0; i < state.food.length; i += 2)
    food.add(state.food[i + 1] * ARENA_COLS + state.food[i]);
  const powers = new Map<number, number>();
  for (const [x, y, kind] of state.powers) powers.set(y * ARENA_COLS + x, kind);
  const eaten = new Set<number>();
  let stopped = false;

  let k = state.tick + 1;
  for (; k <= upTo && body.length && !stopped; k++) {
    credit += creditPerTick(body.length / 2, boostUntil > k);
    if (credit < 1) continue;
    credit -= 1;
    // The server's rule: the first waiting turn applies on its beat (or now, if it asked too far ahead).
    const next = queue[0];
    if (next && (next.at <= k || next.at > k + MAX_LEAD_TICKS)) {
      queue.shift();
      if (!opposite(next.dir, dir)) dir = next.dir;
    }
    let x = body[0] + DIR_STEP[dir][0];
    let y = body[1] + DIR_STEP[dir][1];
    const outside = x < 0 || y < 0 || x >= ARENA_COLS || y >= ARENA_ROWS;
    if (outside && shieldUntil > k) {
      x = (x + ARENA_COLS) % ARENA_COLS;
      y = (y + ARENA_ROWS) % ARENA_ROWS;
    } else if (outside) {
      // A wall ends the prediction: the server will say what happened.
      stopped = true;
      break;
    }
    const cell = y * ARENA_COLS + x;
    if (food.delete(cell)) {
      grow += 1;
      eaten.add(cell);
    } else if (powers.has(cell)) {
      const kind = POWER_KINDS[powers.get(cell)!];
      powers.delete(cell);
      eaten.add(cell);
      if (kind === "super") grow += 3;
      else {
        grow += 1;
        if (kind === "speed") boostUntil = k + POWER_TICKS;
        else shieldUntil = k + POWER_TICKS;
      }
    }
    body.unshift(x, y);
    if (grow > 0) {
      grow--;
      prevTail = null;
    } else {
      const ty = body.pop()!;
      const tx = body.pop()!;
      prevTail = [tx, ty];
    }
    movedAt = k;
  }

  // When the next step comes, with nothing else changing.
  let nextMoveAt = Math.max(upTo, state.tick) + 1;
  if (!stopped)
    for (let c = credit; nextMoveAt < upTo + 100; nextMoveAt++) {
      c += creditPerTick(body.length / 2, boostUntil > nextMoveAt);
      if (c >= 1) break;
    }
  return {
    body,
    dir,
    movedAt,
    prevTail,
    nextMoveAt,
    boost: Math.max(0, boostUntil - upTo),
    shield: Math.max(0, shieldUntil - upTo),
    waiting: queue,
    eaten,
  };
}
