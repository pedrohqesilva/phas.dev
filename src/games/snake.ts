// Snake, full screen: only black and the snake. Arrows, WASD or a swipe steer. Hitting a wall, a block
// or itself blinks the snake and starts a new round; the best round is reported on exit.
//
// Scoring: a square is 1 point and makes the snake 1% faster; eating the next one within 3 s grows a
// combo that multiplies the points (up to ×5). Now and then a super grain shows up for 6 s: 20 points
// (times the combo), but 10% faster. Speed is capped so the game stays playable.
// From 30 points, every 10 points drops a fixed block on the field.
// Power-ups, now and then after a bite: red makes the snake 20% faster for 5 s, green makes it
// invulnerable for 5 s (it goes through itself, the blocks and the walls).
// Easy mode (`game snake facil`): the walls wrap around instead of killing.
import { openGame, type GameTexts } from "./shell.ts";
import { drawSnake, swipe } from "./snake-draw.ts";

export interface SnakeTexts extends GameTexts {
  score: string;
  best: string;
  /** Labels for the active power-ups, with the seconds left after them. */
  speed: string;
  shield: string;
}

const CELL = 18;
const STEP_MS = 95;
/** The fastest the snake gets: about twice the starting speed. */
const MIN_STEP_MS = 48;
const START_LENGTH = 5;
const SUPER_CHANCE = 0.35;
/** Red (faster) and green (shield): the chance each shows up after a bite, how long it stays, how long it lasts. */
const POWER_CHANCE = 0.2;
const POWER_STAY_MS = 6000;
const POWER_MS = 5000;
const BOOST = 1.2;
const POWER_POINTS = 2;
const RED = "#ff4d4d";
const GREEN = "#3ddc84";
const SUPER_MS = 6000;
const SUPER_POINTS = 20;
const COMBO_MS = 3000;
const MAX_COMBO = 5;
const BLOCKS_FROM = 30;
const BLOCK_EVERY = 10;

type Point = { x: number; y: number };
const DIRS: Record<string, Point> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Opens the game; `onExit` gets the best round of the session. */
export function playSnake(
  texts: SnakeTexts,
  onExit: (best: number) => void,
  { wrap = false } = {},
) {
  let cols = 0;
  let rows = 0;
  let snake: Point[] = [];
  let dir: Point = DIRS.ArrowRight;
  const turns: Point[] = [];
  let food: Point = { x: 0, y: 0 };
  let superFood: Point | null = null;
  let superUntil = 0;
  /** The red and green power-ups on the field (null when absent) and until when they stay. */
  let speedFood: Point | null = null;
  let speedFoodUntil = 0;
  let shieldFood: Point | null = null;
  let shieldFoodUntil = 0;
  /** Until when the snake is faster, and invulnerable. */
  let speedUntil = 0;
  let shieldUntil = 0;
  let blocks: Point[] = [];
  let score = 0;
  let best = 0;
  let combo = 1;
  let lastEat = -Infinity;
  let deadUntil = 0;
  let stepMs = STEP_MS;
  /** Time into the current tick, for the smooth drawing. */
  let acc = 0;
  /** Swipe directions (up, right, down, left) as steps. */
  const SWIPE_DIRS = [
    DIRS.ArrowUp,
    DIRS.ArrowRight,
    DIRS.ArrowDown,
    DIRS.ArrowLeft,
  ];

  const shell = openGame({
    texts,
    onResize() {
      // Runs inside openGame on the first call, before `shell` exists: read the window.
      cols = Math.max(10, Math.floor(innerWidth / CELL));
      rows = Math.max(10, Math.floor(innerHeight / CELL));
      if (snake.length) reset();
    },
    onKey(key, down) {
      if (down && DIRS[key]) steer(DIRS[key]);
    },
    onTouch: swipe((dir) => steer(SWIPE_DIRS[dir])),
    onExit: () => onExit(Math.max(best, score)),
  });
  const { g } = shell;

  const taken = (p: Point) =>
    snake.some((q) => same(q, p)) ||
    blocks.some((b) => same(b, p)) ||
    same(food, p) ||
    (superFood !== null && same(superFood, p)) ||
    (speedFood !== null && same(speedFood, p)) ||
    (shieldFood !== null && same(shieldFood, p));
  /** A random free cell; `awayFromHead` keeps blocks from landing right in the snake's path. */
  function freeCell(awayFromHead = 0): Point {
    const head = snake[0];
    for (let tries = 0; tries < 500; tries++) {
      const p = {
        x: Math.floor(Math.random() * cols),
        y: Math.floor(Math.random() * rows),
      };
      if (taken(p)) continue;
      if (
        head &&
        Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < awayFromHead
      )
        continue;
      return p;
    }
    return { x: 0, y: 0 };
  }
  function reset() {
    const y = Math.floor(rows / 2);
    const x = Math.floor(cols / 2);
    snake = Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - i, y }));
    dir = DIRS.ArrowRight;
    turns.length = 0;
    score = 0;
    combo = 1;
    lastEat = -Infinity;
    stepMs = STEP_MS;
    superFood = null;
    speedFood = shieldFood = null;
    speedUntil = shieldUntil = 0;
    blocks = [];
    food = { x: -1, y: -1 };
    food = freeCell();
  }
  reset();

  /** Queues a turn; a reversal onto the snake's own neck is ignored. */
  function steer(next: Point) {
    const last = turns.at(-1) ?? dir;
    if ((next.x === -last.x && next.y === -last.y) || same(next, last)) return;
    if (turns.length < 3) turns.push(next);
  }

  function addPoints(points: number, now: number) {
    // Eating again within COMBO_MS grows the multiplier; a slow bite resets it.
    combo = now - lastEat <= COMBO_MS ? Math.min(MAX_COMBO, combo + 1) : 1;
    lastEat = now;
    const before = score;
    score += points * combo;
    // Crossing 30, 40, 50… drops a block, away from the head.
    for (let mark = BLOCKS_FROM; mark <= score; mark += BLOCK_EVERY)
      if (mark > before) blocks.push(freeCell(6));
  }

  function tick(now: number) {
    if (now < deadUntil) return;
    if (deadUntil) {
      deadUntil = 0;
      reset();
    }
    if (now - lastEat > COMBO_MS) combo = 1;
    dir = turns.shift() ?? dir;
    const shielded = now < shieldUntil;
    let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (wrap || shielded)
      head = { x: (head.x + cols) % cols, y: (head.y + rows) % rows };
    const hitWall =
      head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows;
    if (superFood && now > superUntil) superFood = null;
    if (speedFood && now > speedFoodUntil) speedFood = null;
    if (shieldFood && now > shieldFoodUntil) shieldFood = null;
    const ateSuper = superFood !== null && same(head, superFood);
    const ateSpeed = speedFood !== null && same(head, speedFood);
    const ateShield = shieldFood !== null && same(head, shieldFood);
    const ate = same(head, food) || ateSuper;
    const body = ate || ateSpeed || ateShield ? snake : snake.slice(0, -1);
    if (
      !shielded &&
      (hitWall ||
        body.some((p) => same(p, head)) ||
        blocks.some((b) => same(b, head)))
    ) {
      best = Math.max(best, score);
      deadUntil = now + 900;
      return;
    }
    snake = [head, ...body];
    if (ateSpeed || ateShield) {
      addPoints(POWER_POINTS, now);
      if (ateSpeed) {
        speedFood = null;
        speedUntil = now + POWER_MS;
      } else {
        shieldFood = null;
        shieldUntil = now + POWER_MS;
      }
    } else if (ateSuper) {
      superFood = null;
      addPoints(SUPER_POINTS, now);
      stepMs = Math.max(MIN_STEP_MS, stepMs / 1.1);
    } else if (ate) {
      food = { x: -1, y: -1 };
      addPoints(1, now);
      food = freeCell();
      stepMs = Math.max(MIN_STEP_MS, stepMs / 1.01);
      if (!superFood && Math.random() < SUPER_CHANCE) {
        superFood = freeCell();
        superUntil = now + SUPER_MS;
      }
      if (!speedFood && Math.random() < POWER_CHANCE) {
        speedFood = freeCell();
        speedFoodUntil = now + POWER_STAY_MS;
      }
      if (!shieldFood && Math.random() < POWER_CHANCE) {
        shieldFood = freeCell();
        shieldFoodUntil = now + POWER_STAY_MS;
      }
    }
  }

  function draw(now: number) {
    g.fillStyle = "#000";
    g.fillRect(0, 0, shell.width, shell.height);
    if (deadUntil > now && Math.floor(now / 150) % 2) return;
    g.fillStyle = shell.accent;
    // Score top-left, small and dim so the field stays black; the combo while it lasts.
    g.globalAlpha = 0.7;
    g.font = '13px "Geist Mono Variable", ui-monospace, monospace';
    g.textAlign = "left";
    const comboText =
      combo > 1 && now - lastEat <= COMBO_MS ? `   ×${combo}` : "";
    const hud = `${texts.score} ${score}   ${texts.best} ${Math.max(best, score)}${comboText}`;
    g.fillText(hud, 14, 24);
    // Active power-ups after the score, in their colours, with the seconds left.
    let hudX = 14 + g.measureText(hud).width + 16;
    for (const [label, until, color] of [
      [texts.speed, speedUntil, RED],
      [texts.shield, shieldUntil, GREEN],
    ] as const) {
      if (until <= now) continue;
      const str = `${label} ${Math.ceil((until - now) / 1000)}s`;
      g.fillStyle = color;
      g.fillText(str, hudX, 24);
      hudX += g.measureText(str).width + 12;
    }
    g.fillStyle = shell.accent;
    // Blocks: hollow squares, so they read as walls rather than food.
    g.globalAlpha = 0.8;
    g.strokeStyle = shell.accent;
    g.lineWidth = 2;
    for (const b of blocks)
      g.strokeRect(b.x * CELL + 2, b.y * CELL + 2, CELL - 4, CELL - 4);
    g.globalAlpha = 0.85;
    g.fillRect(food.x * CELL + 5, food.y * CELL + 5, CELL - 10, CELL - 10);
    if (superFood) {
      // Super grain: a full cell in white, blinking, faster in its last two seconds.
      const period = superUntil - now < 2000 ? 90 : 260;
      g.globalAlpha = Math.floor(now / period) % 2 ? 1 : 0.45;
      g.fillStyle = "#fff";
      g.fillRect(
        superFood.x * CELL + 2,
        superFood.y * CELL + 2,
        CELL - 4,
        CELL - 4,
      );
      g.fillStyle = shell.accent;
    }
    // Red and green power-ups: full cells in their colours, blinking faster in their last 2 seconds.
    for (const [p, until, color] of [
      [speedFood, speedFoodUntil, RED],
      [shieldFood, shieldFoodUntil, GREEN],
    ] as const) {
      if (!p) continue;
      g.globalAlpha = Math.floor(now / (until - now < 2000 ? 90 : 260)) % 2 ? 1 : 0.5;
      g.fillStyle = color;
      g.fillRect(p.x * CELL + 2, p.y * CELL + 2, CELL - 4, CELL - 4);
    }
    // The snake turns red while faster and blinks green while shielded (faster in its last 1.5 s).
    g.fillStyle =
      now < shieldUntil &&
      Math.floor(now / (shieldUntil - now < 1500 ? 90 : 400)) % 2
        ? GREEN
        : now < speedUntil
          ? RED
          : shell.accent;
    // Gliding through the tick: the head into the cell it is about to enter, the tail out of its last one.
    const moving = shell.started && !shell.paused && !deadUntil;
    const step = turns[0] ?? dir;
    const next = { x: snake[0].x + step.x, y: snake[0].y + step.y };
    const inside = next.x >= 0 && next.y >= 0 && next.x < cols && next.y < rows;
    drawSnake(
      g,
      {
        body: snake.flatMap((p) => [p.x, p.y]),
        next: moving && inside ? [next.x, next.y] : null,
        growing: [food, superFood, speedFood, shieldFood].some(
          (f) => f !== null && same(next, f),
        ),
      },
      CELL,
      0,
      0,
      acc / effectiveStep(now),
      (i, n) => (i === 0 ? 1 : Math.max(0.35, 1 - i / (n + 8))),
    );
  }

  /** The time per step right now: the red power-up makes it 20% faster. */
  const effectiveStep = (now: number) =>
    now < speedUntil ? stepMs / BOOST : stepMs;

  shell.loop((now, dt) => {
    // Behind the tutorial (and while paused) the snake waits, already drawn.
    if (shell.started && !shell.paused) {
      acc += dt;
      while (acc >= effectiveStep(now)) {
        acc -= effectiveStep(now);
        tick(now);
      }
    }
    draw(now);
  });
}
