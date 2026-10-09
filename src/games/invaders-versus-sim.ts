// Space Invaders versus: two ships face each other, one at the bottom and one at the top, with the invaders
// marching side to side in the middle and bombing both ways. Each player has their own lives (3), score
// and power-ups; a shot that gets through the invaders and hits the other ship costs it a life. The last
// ship standing wins. The rules run on the server (server/invaders-versus.ts); each browser draws them
// with its own ship at the bottom.
//
// Shared with the classic game: the ship's controls and gun (moveShip, fireCooldownMs, shotSpeed), the
// shields, the power-ups (but no saucer: the top is the other player's) and the special (five volleys in
// a row that hit an invader or the other ship charge it; hold fire to let it go).
import {
  bombEveryMs,
  bombSpeed,
  dropChance,
  fireCooldownMs,
  holdSpecial,
  marchStep,
  marchTiming,
  MAX_ARMOUR,
  MAX_LIVES,
  MAX_RAPID,
  MAX_SHOTS,
  moveShip,
  newShip,
  PIERCE_MS,
  randomPower,
  SHIELD_CELL,
  SHIELD_MASK,
  SHIELD_MS,
  shotSpeed,
  SPECIAL_PIERCE,
  SPECIAL_SPEED,
  tallyVolley,
  W,
  type Banner,
  type Box,
  type Cell,
  type Invader,
  type PowerKind,
  type Ship,
  type ShipInput,
  type Shot,
} from "./invaders-sim.ts";

export { W };
/** Taller than the classic field: room for a ship and its shields at each end. */
export const VH = 320;
export const COLS = 8;
export const ROWS = 4;
const GAP_X = 18;
const GAP_Y = 16;
/** Ship 0 at the bottom (shooting up), ship 1 at the top (shooting down). */
export const SHIP_YS = [VH - 24, 24] as const;
/** Which way each ship's shots fly. */
export const SHOT_DIR = [-1, 1] as const;
const GRID_TOP = VH / 2 - ((ROWS - 1) * GAP_Y + 8) / 2;
const SHIELD_GAP = 34;
const START_LIVES = 3;
const HIT_POINTS = 100;

export interface Player {
  ship: Ship;
  lives: number;
  score: number;
  shotCount: number;
  rapidLevel: number;
  pierceUntil: number;
  shieldUntil: number;
  banner: Banner | null;
  bannerUntil: number;
  /** The ship's x on each of the last steps (newest last), to see it where the other player saw it. */
  trail: number[];
  /**
   * Online: how many steps behind this player sees the other ship (their latency plus the smoothing),
   * so their shots are checked against the other ship where it was on their screen.
   */
  rewind: number;
}

/** A power-up flies towards the player who freed it, and only that one can catch it. */
type Drop = { x: number; y: number; kind: PowerKind; to: 0 | 1 };
type Bomb = { x: number; y: number; vy: number };

export interface VersusState {
  invaders: Invader[];
  gridX: number;
  march: number;
  marchTimer: number;
  animFrame: number;
  wave: number;
  players: [Player, Player];
  shots: Shot[];
  bombs: Bomb[];
  drops: Drop[];
  bombTimer: number;
  shields: Cell[];
  volleySeq: number;
  shotSeq: number;
  /** Volleys that hit an invader or the other ship (towards the special). */
  volleyScored: Set<number>;
  winner: 0 | 1 | null;
}

const newPlayer = (): Player => ({
  ship: newShip(W / 2),
  lives: START_LIVES,
  score: 0,
  shotCount: 1,
  rapidLevel: 0,
  pierceUntil: 0,
  shieldUntil: 0,
  banner: null,
  bannerUntil: 0,
  trail: [],
  rewind: 0,
});

export function createVersus(now = 0): VersusState {
  const st: VersusState = {
    invaders: [],
    gridX: 20,
    march: 1,
    marchTimer: 0,
    animFrame: 0,
    wave: 1,
    players: [newPlayer(), newPlayer()],
    shots: [],
    bombs: [],
    drops: [],
    bombTimer: 1500,
    shields: shieldCells().map((c) => ({ ...c, alive: true })),
    volleySeq: 0,
    shotSeq: 0,
    volleyScored: new Set(),
    winner: null,
  };
  newWave(st, now);
  return st;
}

/** Four shields in front of each ship, the top ones upside down (their arch faces their ship). */
export function shieldCells(): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (const side of [0, 1] as const)
    for (let k = 0; k < 4; k++) {
      const left = Math.round(
        (W * (k + 1)) / 5 - (SHIELD_MASK[0].length * SHIELD_CELL) / 2,
      );
      SHIELD_MASK.forEach((line, r) =>
        [...line].forEach((ch, c) => {
          if (ch !== "#") return;
          const y = SHIP_YS[0] - SHIELD_GAP + r * SHIELD_CELL;
          cells.push({
            x: left + c * SHIELD_CELL,
            // Mirrored for the top: same distance from its ship, arch towards it.
            y: side === 0 ? y : VH - y - SHIELD_CELL,
          });
        }),
      );
    }
  return cells;
}

const banner = (p: Player, b: Banner, now: number, ms = 1300) => {
  p.banner = b;
  p.bannerUntil = now + ms;
};

function newWave(st: VersusState, now: number) {
  st.invaders = [];
  for (let row = 0; row < ROWS; row++)
    for (let col = 0; col < COLS; col++)
      st.invaders.push({
        col,
        row,
        alive: true,
        hp: Math.min(st.wave, MAX_ARMOUR),
        hitAt: 0,
      });
  st.gridX = 20;
  st.march = 1;
  for (const p of st.players) banner(p, { kind: "wave", n: st.wave }, now);
}

/** A new match: same room, fresh field. */
export function restartVersus(st: VersusState, now: number) {
  const fresh = createVersus(now);
  Object.assign(st, fresh);
}

const alive = (st: VersusState) => st.invaders.filter((i) => i.alive);
/** Time between two steps of the march: the fewer left, the faster. */
const marchInterval = (st: VersusState) =>
  Math.max(
    40,
    Math.max(110, 520 * 0.86 ** (st.wave - 1)) *
      (alive(st).length / (COLS * ROWS)),
  );
const invaderBox = (st: VersusState, i: Invader): Box => ({
  x: st.gridX + i.col * GAP_X,
  y: GRID_TOP + i.row * GAP_Y,
  w: 11,
  h: 8,
});
const inside = (p: { x: number; y: number }, b: Box) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
export const versusShipBox = (side: 0 | 1, x: number): Box => ({
  x: x - 7,
  y: SHIP_YS[side] - 4,
  w: 13,
  h: 8,
});
const shotStartY = (side: 0 | 1) => SHIP_YS[side] + SHOT_DIR[side] * 6;

function chip(st: VersusState, p: { x: number; y: number }) {
  const hit = st.shields.find(
    (c) =>
      c.alive &&
      p.x >= c.x &&
      p.x < c.x + SHIELD_CELL &&
      p.y >= c.y &&
      p.y < c.y + SHIELD_CELL,
  );
  if (!hit) return false;
  hit.alive = false;
  const near = st.shields.filter(
    (c) =>
      c.alive &&
      Math.abs(c.x - hit.x) <= SHIELD_CELL &&
      Math.abs(c.y - hit.y) <= SHIELD_CELL,
  );
  if (near.length) near[Math.floor(Math.random() * near.length)].alive = false;
  return true;
}

/**
 * A volley from `side`. Online the browser says where and when it fired (`x`, `lag` ms ago): the shots
 * start there and catch up on the next step; `slack` allows for the network's jitter on the pacing.
 */
export function fireVersus(
  st: VersusState,
  side: 0 | 1,
  now: number,
  { x = st.players[side].ship.x, lag = 0, slack = 0 } = {},
): boolean {
  const p = st.players[side];
  if (st.winner !== null || now + slack < p.ship.fireCooldown) return false;
  const volleysOnScreen = new Set(
    st.shots.filter((s) => s.ship === side && !s.special).map((s) => s.volley),
  ).size;
  if (volleysOnScreen >= 1 + Math.ceil(p.rapidLevel / 2) + (slack ? 1 : 0))
    return false;
  const volley = ++st.volleySeq;
  const pierce = now < p.pierceUntil;
  for (let i = 0; i < p.shotCount; i++) {
    const k = i - (p.shotCount - 1) / 2;
    st.shots.push({
      id: ++st.shotSeq,
      ship: side,
      x: x + k * 3,
      y: shotStartY(side),
      vx: k * 34,
      vy: SHOT_DIR[side] * shotSpeed(p.rapidLevel),
      volley,
      pierce,
      pierceLeft: pierce ? 1 : 0,
      hits: new Set(),
      lag,
    });
  }
  p.ship.fireCooldown = now - lag + fireCooldownMs(p.rapidLevel);
  return true;
}

/** The special from `side` (online: from where and when the browser fired it). */
export function fireVersusSpecial(
  st: VersusState,
  side: 0 | 1,
  { x = st.players[side].ship.x, lag = 0 } = {},
) {
  st.shots.push({
    id: ++st.shotSeq,
    lag,
    ship: side,
    x,
    y: shotStartY(side),
    vx: 0,
    vy: SHOT_DIR[side] * SPECIAL_SPEED,
    volley: 0,
    pierce: true,
    pierceLeft: SPECIAL_PIERCE - 1,
    hits: new Set(),
    special: true,
  });
}

/** A hit on a ship: a life (and an upgrade) gone, unless it is blinking from the last one or invincible. */
function hurt(st: VersusState, side: 0 | 1, now: number): boolean {
  const p = st.players[side];
  if (now < p.ship.hitUntil || now < p.shieldUntil) return false;
  p.lives--;
  if (p.shotCount > 1) p.shotCount--;
  else if (p.rapidLevel > 0) p.rapidLevel--;
  p.ship.hitUntil = now + 1200;
  if (p.lives <= 0) st.winner = side === 0 ? 1 : 0;
  return true;
}

function collect(p: Player, kind: PowerKind, now: number) {
  if (kind === "multi") p.shotCount = Math.min(MAX_SHOTS, p.shotCount + 1);
  if (kind === "rapid") p.rapidLevel = Math.min(MAX_RAPID, p.rapidLevel + 1);
  if (kind === "pierce")
    p.pierceUntil = Math.max(now, p.pierceUntil) + PIERCE_MS;
  if (kind === "shield")
    p.shieldUntil = Math.max(now, p.shieldUntil) + SHIELD_MS;
  if (kind === "heart") p.lives = Math.min(MAX_LIVES, p.lives + 1);
  banner(
    p,
    kind === "multi"
      ? { kind: "shots", n: p.shotCount }
      : kind === "rapid"
        ? { kind: "rapid", n: p.rapidLevel }
        : { kind: "power", power: kind },
    now,
  );
}

/**
 * Advances the match by `dt` ms (16 or less). `inputs[i]` drives ship i (the server moves the ships from
 * their players' reports and passes only the fire button). Nothing moves once there is a winner.
 */
export function stepVersus(
  st: VersusState,
  inputs: ShipInput[],
  now: number,
  dt: number,
) {
  if (st.winner !== null) return;
  const s = dt / 1000;

  for (const side of [0, 1] as const) {
    const p = st.players[side];
    const input = inputs[side];
    if (!input) continue;
    p.ship.x = moveShip(p.ship.x, input, dt);
    const pressed = input.fire || input.touchX !== null;
    if (pressed) fireVersus(st, side, now);
    holdSpecial(p.ship, pressed, now, () => fireVersusSpecial(st, side));
  }

  for (const p of st.players) {
    p.trail.push(p.ship.x);
    if (p.trail.length > 16) p.trail.shift();
  }

  // The invaders march side to side (never towards anyone); the fewer left, the faster.
  const living = alive(st);
  st.marchTimer += dt;
  if (st.marchTimer >= marchInterval(st) && living.length) {
    st.marchTimer = 0;
    const g = { ...st, gridY: 0 };
    marchStep(
      g,
      living.map((i) => i.col),
      0,
    );
    st.gridX = g.gridX;
    st.march = g.march;
    st.animFrame = g.animFrame;
  }

  // Shots: plain ones in one move, the special in short hops so it cannot skip over anything.
  const gone = new Map<number, 0 | 1>();
  st.shots = st.shots.filter((shot) => {
    // Hops of 6 units at most: the special, or a shot catching up on its press's trip, skips nothing.
    const span = s + (shot.lag ?? 0) / 1000;
    shot.lag = 0;
    const hops = Math.max(1, Math.ceil((Math.abs(shot.vy) * span) / 6));
    for (let k = 0; k < hops; k++)
      if (moveShot(shot, span / hops) === "gone") return false;
    return true;
  });
  for (const [volley, side] of gone)
    if (!st.shots.some((x) => x.volley === volley))
      tallyVolley(st.players[side].ship, st.volleyScored.delete(volley));

  function moveShot(shot: Shot, s: number): "gone" | "flying" {
    const side = shot.ship as 0 | 1;
    const other: 0 | 1 = side === 0 ? 1 : 0;
    const stop = () => {
      if (!shot.special) gone.set(shot.volley, side);
      return "gone" as const;
    };
    shot.x += shot.vx * s;
    shot.y += shot.vy * s;
    // Shields stop plain shots, from either side; the special drills through.
    if (chip(st, shot) && !shot.special) return stop();
    for (const target of alive(st)) {
      if (shot.hits.has(target) || !inside(shot, invaderBox(st, target)))
        continue;
      shot.hits.add(target);
      st.volleyScored.add(shot.volley);
      target.hp -= shot.special ? 2 : 1;
      target.hitAt = now;
      if (target.hp <= 0) {
        target.alive = false;
        st.players[side].score += 10 * st.wave;
        if (Math.random() < dropChance(st.wave)) {
          const b = invaderBox(st, target);
          st.drops.push({
            x: b.x + 5,
            y: b.y + 4,
            kind: randomPower(),
            to: side,
          });
        }
      }
      if (shot.pierceLeft > 0) {
        shot.pierceLeft--;
        continue;
      }
      return stop();
    }
    // The other ship, where the shooter saw it (online they see it a little in the past; favour them).
    const target = st.players[other];
    const seenX =
      target.trail[target.trail.length - 1 - st.players[side].rewind] ??
      target.ship.hitX ??
      target.ship.x;
    if (inside(shot, versusShipBox(other, seenX))) {
      if (hurt(st, other, now)) {
        st.volleyScored.add(shot.volley);
        st.players[side].score += HIT_POINTS * st.wave;
      }
      return stop();
    }
    return shot.y < 0 || shot.y > VH || shot.x < 0 || shot.x > W
      ? stop()
      : "flying";
  }

  // Bombs, from the invader at the end of a random column facing a random side.
  st.bombTimer -= dt;
  if (st.bombTimer <= 0 && living.length) {
    st.bombTimer = bombEveryMs(st.wave) * 1.6 * (0.6 + Math.random() * 0.8);
    const cols = [...new Set(living.map((i) => i.col))];
    const volley = Math.min(1 + Math.floor((st.wave - 1) / 2), cols.length);
    for (let n = 0; n < volley; n++) {
      const col = cols.splice(Math.floor(Math.random() * cols.length), 1)[0];
      const down = Math.random() < 0.5;
      const shooter = living
        .filter((i) => i.col === col)
        .sort((a, b) => (down ? b.row - a.row : a.row - b.row))[0];
      const b = invaderBox(st, shooter);
      st.bombs.push({
        x: b.x + 5,
        y: down ? b.y + 8 : b.y,
        vy: (down ? 1 : -1) * bombSpeed(st.wave),
      });
    }
  }
  st.bombs = st.bombs.filter((b) => {
    b.y += b.vy * s;
    const side: 0 | 1 = b.vy > 0 ? 0 : 1;
    const ship = st.players[side].ship;
    if (inside(b, versusShipBox(side, ship.hitX ?? ship.x))) {
      hurt(st, side, now);
      return false;
    }
    return b.y > -4 && b.y < VH + 4;
  });

  // Power-ups fly to the player who freed them.
  st.drops = st.drops.filter((d) => {
    d.y += (d.to === 0 ? 1 : -1) * 45 * s;
    const ship = st.players[d.to].ship;
    const box = versusShipBox(d.to, ship.hitX ?? ship.x);
    if (inside(d, { x: box.x - 3, y: box.y - 3, w: box.w + 6, h: box.h + 6 })) {
      collect(st.players[d.to], d.kind, now);
      return false;
    }
    return d.y > -4 && d.y < VH + 4;
  });

  // A cleared field brings the next wave, tougher; the shields stay as they are.
  if (!alive(st).length) {
    st.wave++;
    newWave(st, now);
  }
}

/** What each browser draws, in field coordinates (ship 0 at the bottom); the page flips it for ship 1. */
export interface VersusView {
  /** The game clock (ms) when the snapshot was taken: browsers play it forward from there. */
  at: number;
  wave: number;
  gridX: number;
  animFrame: number;
  /** The march: which way, ms to its next step, ms between steps. */
  march: number;
  marchIn: number;
  marchEvery: number;
  hp: number[];
  flash: number[];
  players: {
    x: number;
    blink: boolean;
    lives: number;
    score: number;
    shotCount: number;
    rapidLevel: number;
    pierceLeft: number;
    shieldLeft: number;
    streak: number;
    special: boolean;
    banner: Banner | null;
  }[];
  /** Flat [x, y, kind (0 plain, 1 piercing, 2 special), vx, vy, ship, id, …]. */
  shots: number[];
  /** Flat [x, y, vy, …]. */
  bombs: number[];
  drops: { x: number; y: number; kind: PowerKind; to: 0 | 1 }[];
  shields: string;
  winner: 0 | 1 | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function viewVersus(st: VersusState, now: number): VersusView {
  return {
    at: now,
    wave: st.wave,
    gridX: st.gridX,
    animFrame: st.animFrame,
    ...(() => {
      const m = marchTiming(st.marchTimer, marchInterval(st));
      return { march: st.march, marchIn: m.next, marchEvery: m.every };
    })(),
    hp: st.invaders.map((i) => (i.alive ? i.hp : 0)),
    flash: st.invaders.flatMap((i, k) =>
      i.alive && now - i.hitAt < 90 ? [k] : [],
    ),
    players: st.players.map((p) => ({
      x: r1(p.ship.x),
      blink: now < p.ship.hitUntil && Math.floor(now / 120) % 2 === 1,
      lives: p.lives,
      score: p.score,
      shotCount: p.shotCount,
      rapidLevel: p.rapidLevel,
      pierceLeft: Math.max(0, p.pierceUntil - now),
      shieldLeft: Math.max(0, p.shieldUntil - now),
      streak: p.ship.streak,
      special: p.ship.special,
      banner: now < p.bannerUntil ? p.banner : null,
    })),
    shots: st.shots.flatMap((s) => [
      r1(s.x),
      r1(s.y),
      s.special ? 2 : s.pierce ? 1 : 0,
      r1(s.vx),
      r1(s.vy),
      s.ship,
      s.id,
    ]),
    bombs: st.bombs.flatMap((b) => [r1(b.x), r1(b.y), r1(b.vy)]),
    drops: st.drops.map((d) => ({
      x: r1(d.x),
      y: r1(d.y),
      kind: d.kind,
      to: d.to,
    })),
    shields: st.shields.map((c) => (c.alive ? "1" : "0")).join(""),
    winner: st.winner,
  };
}

/** Invader slot k's box in a view. */
export const versusSlotBox = (gridX: number, k: number): Box => ({
  x: gridX + (k % COLS) * GAP_X,
  y: GRID_TOP + Math.floor(k / COLS) * GAP_Y,
  w: 11,
  h: 8,
});
