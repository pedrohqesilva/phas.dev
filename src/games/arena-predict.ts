// Plays your own arena snake forward from a snapshot, by the server's own rules (server/arena.ts), so the
// browser can show it where it will be when your turns reach the server. No DOM: also used by the tests.
import {
  ARENA_COLS,
  ARENA_ROWS,
  DIR_STEP,
  type ArenaSnake,
  type ArenaState,
  type Dir,
} from "./protocol.ts";

export const opposite = (a: Dir, b: Dir) => (a + 2) % 4 === b;
/** Same as the server: a turn asking for a tick further ahead than this applies at once. */
export const MAX_LEAD_TICKS = 4;

/** Your snake at a later tick: the snapshot's, moved forward with the turns still waiting on the server. */
export function predict(
  me: ArenaSnake,
  state: ArenaState,
  turns: { dir: Dir; at: number }[],
  upTo: number,
): { body: number[]; dir: Dir; eaten: Set<number> } {
  const body = [...me.body];
  let dir = me.dir;
  let grow = me.grow;
  const queue = [...turns];
  const food = new Set<number>();
  for (let i = 0; i < state.food.length; i += 2)
    food.add(state.food[i + 1] * ARENA_COLS + state.food[i]);
  const superKey = state.superFood
    ? state.superFood[1] * ARENA_COLS + state.superFood[0]
    : -1;
  const eaten = new Set<number>();
  for (let k = state.tick + 1; k <= upTo && body.length; k++) {
    // The server's rule: the first waiting turn applies on its tick (or now, if it asked too far ahead).
    const next = queue[0];
    if (next && (next.at <= k || next.at > k + MAX_LEAD_TICKS)) {
      queue.shift();
      if (!opposite(next.dir, dir)) dir = next.dir;
    }
    const x = body[0] + DIR_STEP[dir][0];
    const y = body[1] + DIR_STEP[dir][1];
    // A wall ends the prediction: the server will say what happened.
    if (x < 0 || y < 0 || x >= ARENA_COLS || y >= ARENA_ROWS) break;
    const cell = y * ARENA_COLS + x;
    if (food.delete(cell)) {
      grow += 1;
      eaten.add(cell);
    } else if (cell === superKey && !eaten.has(cell)) {
      grow += 3;
      eaten.add(cell);
    }
    body.unshift(x, y);
    if (grow > 0) grow--;
    else body.length -= 2;
  }
  return { body, dir, eaten };
}
