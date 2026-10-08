// What both Snakes (solo and the online arena) share on screen: the swipe that steers on a phone and the
// smooth drawing. The game moves a whole cell per tick; the drawing slides the head into its next cell
// and pulls the tail out of its last one through the tick, so the snake glides at the screen's frame rate.
import type { Dir } from "./protocol.ts";

/** How far a finger has to travel before it counts as a swipe. */
const SWIPE_PX = 18;

/**
 * A swipe turns as soon as the finger has gone far enough, mid-gesture, instead of waiting for it to
 * lift; keep sliding the other way to chain a second turn in the same gesture.
 */
export function swipe(onTurn: (dir: Dir) => void) {
  let from: { x: number; y: number } | null = null;
  return (x: number, y: number, phase: "start" | "move" | "end") => {
    if (phase === "start") from = { x, y };
    if (phase === "end") from = null;
    if (phase !== "move" || !from) return;
    const dx = x - from.x;
    const dy = y - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    onTurn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    from = { x, y };
  };
}

export interface SnakeSprite {
  /** Cells, head first: flat [x0, y0, x1, y1, …]. */
  body: number[];
  /** The cell the head moves into on the next tick; null when it is not moving (or wraps around). */
  next: readonly [number, number] | null;
  /** True when the next tick grows the snake, so the tail stays put. */
  growing: boolean;
}

/**
 * Draws a snake `progress` (0 to 1) of the way through the current tick, each cell `cell` px from
 * (`ox`, `oy`), in the current fill style; `alpha(i, n)` dims segment i of n.
 */
export function drawSnake(
  g: CanvasRenderingContext2D,
  s: SnakeSprite,
  cell: number,
  ox: number,
  oy: number,
  progress: number,
  alpha: (i: number, n: number) => number,
) {
  const n = s.body.length / 2;
  const p = Math.max(0, Math.min(1, progress));
  const square = (x: number, y: number, a: number) => {
    g.globalAlpha = a;
    g.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
  };
  // Tail first, so the head is drawn on top.
  for (let i = n - 1; i >= 0; i--) {
    let x = s.body[i * 2];
    let y = s.body[i * 2 + 1];
    // The tail leaves its cell through the tick, towards the segment before it (unless the snake grows).
    if (i === n - 1 && i > 0 && !s.growing && s.next) {
      const tx = s.body[(i - 1) * 2] - x;
      const ty = s.body[(i - 1) * 2 + 1] - y;
      if (Math.abs(tx) + Math.abs(ty) === 1) {
        x += tx * p;
        y += ty * p;
      }
    }
    square(x, y, alpha(i, n));
  }
  // The head enters its next cell through the tick.
  if (s.next && n) {
    const dx = s.next[0] - s.body[0];
    const dy = s.next[1] - s.body[1];
    if (Math.abs(dx) + Math.abs(dy) === 1)
      square(s.body[0] + dx * p, s.body[1] + dy * p, alpha(0, n));
  }
  g.globalAlpha = 1;
}

/**
 * Draws a snake at `progress` steps into its last one: 1 is where it is now, 0 where it was before that
 * step (head on `body[1]`, tail on `prevTail`), and below 0 further back, along its own body. Only steps
 * that already happened are drawn, so nothing is guessed and taken back, and a snapshot that brings a step
 * the picture has not reached yet changes nothing on screen: the online arena draws every snake this way.
 */
export function drawSnakeArriving(
  g: CanvasRenderingContext2D,
  body: number[],
  prevTail: readonly [number, number] | null,
  cell: number,
  ox: number,
  oy: number,
  progress: number,
  alpha: (i: number, n: number) => number,
) {
  const n = body.length / 2;
  if (!n) return;
  // How far behind its latest cell the head is drawn, in cells along the body.
  const back = Math.max(0, Math.min(n - 1, 1 - Math.min(1, progress)));
  const square = (x: number, y: number, a: number) => {
    g.globalAlpha = a;
    g.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
  };
  /** A point `t` of the way from one cell to the next; a jump (through a wall) stays on the first. */
  const along = (ax: number, ay: number, bx: number, by: number, t: number) =>
    Math.abs(bx - ax) + Math.abs(by - ay) === 1
      ? ([ax + (bx - ax) * t, ay + (by - ay) * t] as const)
      : ([ax, ay] as const);
  // The tail leaving the cell it had before the last step (still in it while the picture is behind).
  if (prevTail) {
    const [x, y] = along(
      prevTail[0],
      prevTail[1],
      body[(n - 1) * 2],
      body[(n - 1) * 2 + 1],
      Math.max(0, 1 - back),
    );
    square(x, y, alpha(n - 1, n));
  }
  const i0 = Math.floor(back);
  for (let i = n - 1; i > i0; i--)
    square(body[i * 2], body[i * 2 + 1], alpha(i, n));
  // The head, between the cell it is leaving and the one it is entering.
  const [hx, hy] =
    i0 + 1 < n
      ? along(
          body[(i0 + 1) * 2],
          body[(i0 + 1) * 2 + 1],
          body[i0 * 2],
          body[i0 * 2 + 1],
          1 - (back - i0),
        )
      : ([body[i0 * 2], body[i0 * 2 + 1]] as const);
  square(hx, hy, alpha(0, n));
  g.globalAlpha = 1;
}
