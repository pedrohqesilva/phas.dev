// Tetris rules, in the browser for both modes: solo, and versus (where each player runs their own game and
// the server only passes along attacks and boards). A 10×20 well, the seven pieces drawn from a shuffled
// bag (seeded, so both players in a match get the same sequence), rotation with small wall kicks, a hold,
// a ghost showing where the piece lands, gravity that speeds up every 10 lines, and classic scoring.
// Clearing 2, 3 or 4 lines at once in versus sends 1, 2 or 4 garbage lines to the other player.

export const COLS = 10;
export const ROWS = 20;
/** Rows above the visible well where pieces spawn. */
const HIDDEN = 2;
const TOTAL = ROWS + HIDDEN;
/** The garbage cell's colour index (pieces are 1 to 7). */
export const GARBAGE = 8;

type Shape = number[][];
/** Each piece: its colour index and its four rotations, as [x, y] cells in a 4×4 box. */
const PIECES: { color: number; rotations: Shape[] }[] = [
  [
    "....####........",
    "..#...#...#...#.",
    "........####....",
    ".#...#...#...#..",
  ], // I
  [
    ".##..##.........",
    ".##..##.........",
    ".##..##.........",
    ".##..##.........",
  ], // O
  [
    ".#..###.........",
    ".#...##..#......",
    "....###..#......",
    ".#..##...#......",
  ], // T
  [
    ".##.##..........",
    ".#...##...#.....",
    ".....##.##......",
    "#...##...#......",
  ], // S
  [
    "##...##.........",
    "..#..##..#......",
    "....##...##.....",
    ".#..##..#.......",
  ], // Z
  [
    "#...###.........",
    ".##..#...#......",
    "....###...#.....",
    ".#...#..##......",
  ], // J
  [
    "..#.###.........",
    ".#...#...##.....",
    "....###.#.......",
    "##...#...#......",
  ], // L
].map((rots, i) => ({
  color: i + 1,
  rotations: rots.map((r) =>
    [...r].flatMap((c, k) => (c === "#" ? [[k % 4, Math.floor(k / 4)]] : [])),
  ),
}));
/** Tried in order when a rotation does not fit as is. */
const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [-2, 0],
  [2, 0],
  [-1, -1],
  [1, -1],
];
const LOCK_MS = 450;
const MAX_LOCK_RESETS = 15;
const LINE_POINTS = [0, 100, 300, 500, 800];
/** Garbage lines sent for 1 to 4 lines cleared at once. */
export const ATTACK = [0, 0, 1, 2, 4];

/** A small seeded random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Piece {
  kind: number;
  rot: number;
  x: number;
  y: number;
}

export interface TetrisState {
  /** TOTAL rows of COLS cells, top first: 0 empty, 1 to 7 a piece's colour, GARBAGE. */
  well: number[][];
  piece: Piece | null;
  next: number[];
  hold: number | null;
  holdUsed: boolean;
  score: number;
  lines: number;
  level: number;
  over: boolean;
  /** Game time when the piece falls a row next, and when it locks if it stays resting. */
  fallAt: number;
  lockAt: number | null;
  lockResets: number;
  /** Lines cleared since the game last read it (the caller sets it back to 0 each frame), for the attack. */
  cleared: number;
  /** How many pieces have landed: tells the versus mode a piece just locked. */
  locks: number;
  /** Rows that just cleared (their indices before removal) and when, for a short flash. */
  flashRows: number[];
  flashAt: number;
  random: () => number;
  bag: number[];
}

export function createTetris(seed: number, now: number): TetrisState {
  const st: TetrisState = {
    well: Array.from({ length: TOTAL }, () => Array(COLS).fill(0)),
    piece: null,
    next: [],
    hold: null,
    holdUsed: false,
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    fallAt: now,
    lockAt: null,
    lockResets: 0,
    cleared: 0,
    locks: 0,
    flashRows: [],
    flashAt: 0,
    random: rng(seed),
    bag: [],
  };
  while (st.next.length < 4) st.next.push(draw(st));
  spawn(st, now);
  return st;
}

/** The next piece from the bag: all seven, shuffled, then a new bag. */
function draw(st: TetrisState): number {
  if (!st.bag.length) {
    st.bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = st.bag.length - 1; i > 0; i--) {
      const j = Math.floor(st.random() * (i + 1));
      [st.bag[i], st.bag[j]] = [st.bag[j], st.bag[i]];
    }
  }
  return st.bag.pop()!;
}

export const cellsOf = (p: Piece) =>
  PIECES[p.kind].rotations[p.rot].map(([x, y]) => [p.x + x, p.y + y] as const);
export const colorOf = (kind: number) => PIECES[kind].color;
export const shapeOf = (kind: number) => PIECES[kind].rotations[0];

function fits(st: TetrisState, p: Piece): boolean {
  return cellsOf(p).every(
    ([x, y]) =>
      x >= 0 && x < COLS && y < TOTAL && (y < 0 || st.well[y][x] === 0),
  );
}

/** Milliseconds per row of fall at the current level. */
export const gravityMs = (level: number) =>
  Math.max(50, 800 * 0.85 ** (level - 1));

function spawn(st: TetrisState, now: number, kind = st.next.shift()!) {
  if (st.next.length < 4) st.next.push(draw(st));
  st.piece = { kind, rot: 0, x: 3, y: kind === 0 ? 0 : 0 };
  st.fallAt = now + gravityMs(st.level);
  st.lockAt = null;
  st.lockResets = 0;
  if (!fits(st, st.piece)) {
    st.over = true;
    st.piece = null;
  }
}

/** A successful move or rotation while resting gives the piece a little more time (a few times). */
function moved(st: TetrisState, now: number) {
  if (st.lockAt !== null && st.lockResets < MAX_LOCK_RESETS) {
    st.lockAt = now + LOCK_MS;
    st.lockResets++;
  }
}

export function shift(st: TetrisState, dx: number, now: number): boolean {
  if (!st.piece || st.over) return false;
  const p = { ...st.piece, x: st.piece.x + dx };
  if (!fits(st, p)) return false;
  st.piece = p;
  moved(st, now);
  return true;
}

export function rotate(st: TetrisState, dir: 1 | -1, now: number): boolean {
  if (!st.piece || st.over) return false;
  const rot = (st.piece.rot + dir + 4) % 4;
  for (const [dx, dy] of KICKS) {
    const p = { ...st.piece, rot, x: st.piece.x + dx, y: st.piece.y + dy };
    if (fits(st, p)) {
      st.piece = p;
      moved(st, now);
      return true;
    }
  }
  return false;
}

/** Where the piece would land if dropped now. */
export function ghost(st: TetrisState): Piece | null {
  if (!st.piece) return null;
  let p = st.piece;
  while (fits(st, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
  return p;
}

/** One row down; false if it cannot go further. Soft drop scores 1 a row. */
export function down(st: TetrisState, now: number, soft = false): boolean {
  if (!st.piece || st.over) return false;
  const p = { ...st.piece, y: st.piece.y + 1 };
  if (!fits(st, p)) {
    st.lockAt ??= now + LOCK_MS;
    return false;
  }
  st.piece = p;
  st.lockAt = null;
  st.fallAt = now + gravityMs(st.level);
  if (soft) st.score += 1;
  return true;
}

/** Straight to the bottom and locked at once; 2 points a row. */
export function hardDrop(st: TetrisState, now: number) {
  if (!st.piece || st.over) return;
  const g = ghost(st)!;
  st.score += 2 * (g.y - st.piece.y);
  st.piece = g;
  lock(st, now);
}

/** Swaps the piece with the held one (once per piece). */
export function holdPiece(st: TetrisState, now: number) {
  if (!st.piece || st.over || st.holdUsed) return;
  const current = st.piece.kind;
  if (st.hold === null) {
    st.hold = current;
    spawn(st, now);
  } else {
    const held = st.hold;
    st.hold = current;
    spawn(st, now, held);
  }
  st.holdUsed = true;
}

function lock(st: TetrisState, now: number) {
  st.locks++;
  const p = st.piece!;
  for (const [x, y] of cellsOf(p)) if (y >= 0) st.well[y][x] = colorOf(p.kind);
  // Locked entirely above the visible well: the stack has reached the top.
  if (cellsOf(p).every(([, y]) => y < HIDDEN)) {
    st.over = true;
    st.piece = null;
    return;
  }
  const full = st.well.flatMap((row, i) =>
    row.every((c) => c !== 0) ? [i] : [],
  );
  st.cleared += full.length;
  if (full.length) {
    st.flashRows = full.map((i) => i - HIDDEN);
    st.flashAt = now;
    st.well = st.well.filter((_, i) => !full.includes(i));
    while (st.well.length < TOTAL) st.well.unshift(Array(COLS).fill(0));
    st.score += LINE_POINTS[full.length] * st.level;
    st.lines += full.length;
    st.level = 1 + Math.floor(st.lines / 10);
  }
  st.holdUsed = false;
  spawn(st, now);
}

/**
 * Advances time: gravity pulls the piece down, a resting piece locks after a moment. Returns the lines
 * the step cleared (0 most of the time), for the versus attack.
 */
export function stepTetris(st: TetrisState, now: number): number {
  if (st.over || !st.piece) return st.cleared;
  while (now >= st.fallAt && st.piece && !st.over) {
    if (!down(st, st.fallAt)) {
      st.fallAt = now + gravityMs(st.level);
      break;
    }
  }
  if (st.piece && st.lockAt !== null && now >= st.lockAt) {
    if (fits(st, { ...st.piece, y: st.piece.y + 1 })) st.lockAt = null;
    else lock(st, now);
  }
  return st.cleared;
}

/** Versus: garbage lines rise from the bottom, each with one hole in the same column. */
export function addGarbage(st: TetrisState, lines: number, hole: number) {
  if (st.over || lines <= 0) return;
  for (let i = 0; i < lines; i++) {
    st.well.shift();
    const row = Array(COLS).fill(GARBAGE);
    row[hole % COLS] = 0;
    st.well.push(row);
  }
  // A piece pushed into the stack moves up out of it, if it can.
  if (st.piece) {
    while (!fits(st, st.piece) && st.piece.y > -4)
      st.piece = { ...st.piece, y: st.piece.y - 1 };
    if (!fits(st, st.piece)) {
      st.over = true;
      st.piece = null;
    }
  }
}

/** The visible well as a 200-character string (one digit per cell), to show the other player. */
export function wellString(st: TetrisState): string {
  const rows = st.well.slice(HIDDEN).map((r) => [...r]);
  if (st.piece)
    for (const [x, y] of cellsOf(st.piece))
      if (y >= HIDDEN) rows[y - HIDDEN][x] = colorOf(st.piece.kind);
  return rows.map((r) => r.join("")).join("");
}

/** Rows visible to the player, top first (the hidden spawn rows left out). */
export const visibleRows = (st: TetrisState) => st.well.slice(HIDDEN);
export const HIDDEN_ROWS = HIDDEN;
