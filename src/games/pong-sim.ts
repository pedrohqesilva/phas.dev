// Pong's rules, shared by the server (online matches) and the browser (the match against the computer, and
// playing the ball forward between snapshots). A 320×200 field, a paddle on each side, first to 7 wins.
// The ball speeds up a little with every hit, and leaves a paddle at a steeper angle the further from the
// paddle's middle it hits.

export const W = 320;
export const H = 200;
export const PADDLE_H = 36;
export const PADDLE_W = 4;
/** The paddles' faces: where the ball bounces off each. */
export const PADDLE_X = [14, W - 14] as const;
export const BALL = 4;
export const WIN = 7;
/** How fast a paddle moves on keys, and how long a serve waits after a point. */
export const PADDLE_SPEED = 240;
export const SERVE_MS = 900;
const START_SPEED = 170;
const MAX_SPEED = 420;
const SPEED_UP = 1.06;
/** The steepest angle off a paddle's edge (about 55°). */
const MAX_BOUNCE = 0.95;

export interface PongState {
  ball: { x: number; y: number; vx: number; vy: number };
  /** Paddle centres (y). */
  paddles: [number, number];
  score: [number, number];
  /** Game time of the next serve (the ball waits in the middle until then). */
  serveAt: number;
  /** Who won, once someone reaches WIN. */
  winner: 0 | 1 | null;
  rally: number;
}

export function createPong(now: number): PongState {
  const st: PongState = {
    ball: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    paddles: [H / 2, H / 2],
    score: [0, 0],
    serveAt: now + SERVE_MS,
    winner: null,
    rally: 0,
  };
  serve(st, Math.random() < 0.5 ? 0 : 1, now);
  return st;
}

/** Puts the ball back in the middle, to go towards `to` once the serve wait is over. */
function serve(st: PongState, to: 0 | 1, now: number) {
  const angle = (Math.random() - 0.5) * 0.8;
  const dir = to === 0 ? -1 : 1;
  st.ball = {
    x: W / 2,
    y: H / 2,
    vx: dir * START_SPEED * Math.cos(angle),
    vy: START_SPEED * Math.sin(angle),
  };
  st.serveAt = now + SERVE_MS;
  st.rally = 0;
}

export const clampPaddle = (y: number) =>
  Math.max(PADDLE_H / 2, Math.min(H - PADDLE_H / 2, y));

/** A paddle moved by keys (`dir` -1 up, 1 down) for `dt` ms. */
export const movePaddle = (y: number, dir: number, dt: number) =>
  clampPaddle(y + (dir * PADDLE_SPEED * dt) / 1000);

/**
 * Moves the ball `dt` ms (keep it at 16 or less): off the top and bottom, off a paddle when it reaches
 * one's face, past it otherwise (a point). `hitAt` gives where each paddle is for the bounce check (the
 * server passes where each player has it on their own screen), and `reach` how far either way that may
 * be off (the server is never quite sure): the paddle counts as anywhere in that span. Returns who
 * scored, if anyone.
 */
export function stepBall(
  st: PongState,
  now: number,
  dt: number,
  hitAt: readonly [number, number] = st.paddles,
  reach: readonly [number, number] = [0, 0],
): 0 | 1 | null {
  if (st.winner !== null || now < st.serveAt) return null;
  const b = st.ball;
  const s = dt / 1000;
  const nx = b.x + b.vx * s;
  let ny = b.y + b.vy * s;
  // Top and bottom walls.
  if (ny < BALL / 2) {
    ny = BALL - ny;
    b.vy = Math.abs(b.vy);
  } else if (ny > H - BALL / 2) {
    ny = 2 * (H - BALL / 2) - ny;
    b.vy = -Math.abs(b.vy);
  }
  // A paddle's face, crossed this step.
  for (const side of [0, 1] as const) {
    const face = side === 0 ? PADDLE_X[0] + BALL / 2 : PADDLE_X[1] - BALL / 2;
    const towards = side === 0 ? b.vx < 0 : b.vx > 0;
    const crossed =
      side === 0 ? b.x >= face && nx < face : b.x <= face && nx > face;
    if (!towards || !crossed) continue;
    const t = (face - b.x) / (nx - b.x);
    const yAt = b.y + (ny - b.y) * t;
    // The paddle's place in its span nearest the ball.
    const at = Math.max(
      hitAt[side] - reach[side],
      Math.min(hitAt[side] + reach[side], yAt),
    );
    const offset = (yAt - at) / (PADDLE_H / 2 + BALL / 2);
    if (Math.abs(offset) <= 1) {
      // A hit: back the other way, faster, at an angle set by where it met the paddle.
      const speed = Math.min(MAX_SPEED, Math.hypot(b.vx, b.vy) * SPEED_UP);
      const angle = offset * MAX_BOUNCE;
      b.vx = (side === 0 ? 1 : -1) * speed * Math.cos(angle);
      b.vy = speed * Math.sin(angle);
      b.x = face;
      b.y = yAt;
      st.rally++;
      return null;
    }
  }
  b.x = nx;
  b.y = ny;
  // Out on a side: a point for the other player.
  if (b.x < -BALL || b.x > W + BALL) {
    const scorer: 0 | 1 = b.x < 0 ? 1 : 0;
    st.score[scorer]++;
    if (st.score[scorer] >= WIN) {
      st.winner = scorer;
      b.vx = b.vy = 0;
      b.x = W / 2;
      b.y = H / 2;
    } else serve(st, scorer === 0 ? 1 : 0, now);
    return scorer;
  }
  return null;
}

/** The computer's paddle: follows the ball while it comes its way, slower than a person, and a bit late. */
export function cpuPaddle(st: PongState, side: 0 | 1, dt: number): number {
  const b = st.ball;
  const coming = side === 0 ? b.vx < 0 : b.vx > 0;
  const target = coming ? b.y + Math.sin(b.x / 37) * 10 : H / 2;
  const diff = target - st.paddles[side];
  const max = (PADDLE_SPEED * 0.72 * dt) / 1000;
  return clampPaddle(st.paddles[side] + Math.max(-max, Math.min(max, diff)));
}

/** What travels to the browsers: the ball with its speed (to play it forward), paddles, score, serve. */
export interface PongView {
  ball: [number, number, number, number];
  paddles: [number, number];
  score: [number, number];
  /** ms until the serve (0 when in play). */
  serveIn: number;
  winner: 0 | 1 | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export const viewPong = (st: PongState, now: number): PongView => ({
  ball: [r1(st.ball.x), r1(st.ball.y), r1(st.ball.vx), r1(st.ball.vy)],
  paddles: [r1(st.paddles[0]), r1(st.paddles[1])],
  score: [...st.score] as [number, number],
  serveIn: Math.max(0, Math.round(st.serveAt - now)),
  winner: st.winner,
});
