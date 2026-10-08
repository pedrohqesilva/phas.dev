// Space Invaders rules, with no DOM: the same simulation runs in the browser (solo) and on the server
// (co-op, two ships). The field is the arcade's 224×256; times are game milliseconds.
//
// Lives: three to start (five at most); a bomb costs one, and so do three volleys in a row that hit nothing.
// Waves: on wave N every invader takes N hits (4 at most), and they march, bomb more often and faster.
// Four shields stand above the ships: they stop (and chip away under) the players' shots, while the
// invaders' bombs go straight through them. They are rebuilt every wave.
// Now and then a saucer crosses the top: hitting it is worth 100 × the wave and always drops a power-up;
// 1 time in 100 that is the bomb "B", which takes half the remaining hits off every invader on the field.
// Losing a life also costs an upgrade (one extra shot first, then a rapid level).
// Power-ups, dropped now and then by a killed invader and caught by any ship (the team shares them):
//   "+" one more shot per volley, "R" a faster gun (both stack and last the whole game, waves included),
//   "P" for 10 s, shots that go through the first invader they hit, "I" 10 s of invincibility (no bomb or
//   miss costs a life), "♥" one life back.
// In co-op the team shares score, lives, misses and upgrades; each ship fires its own volleys.
// The special: five volleys in a row that hit an invader (or the saucer) charge it; holding fire then lets
// it go, a fast shot that drills through shields and up to three invaders, two hits on each. A volley that hits nothing
// starts the count again.

export type PowerKind =
  "multi" | "rapid" | "pierce" | "shield" | "heart" | "nuke";

export const W = 224;
export const H = 256;
export const COLS = 8;
export const ROWS = 5;
const GAP_X = 18;
const GAP_Y = 16;
export const SHIP_Y = H - 24;
const MISSES_PER_LIFE = 3;
/** The special: volleys in a row that must hit, how long to hold fire, its speed and how many it drills. */
export const SPECIAL_STREAK = 5;
export const SPECIAL_HOLD_MS = 400;
export const SPECIAL_SPEED = 680;
export const SPECIAL_PIERCE = 3;
export const MAX_LIVES = 5;
/** Drop chance per kill: 5% on wave 1, one point less each wave, never under 1%. */
export const dropChance = (wave: number) =>
  Math.max(0.01, 0.05 - (wave - 1) * 0.01);
/** Every wave starts faster and bombs more: these shrink by a fixed share per wave, with a floor. */
export const marchBaseMs = (wave: number) =>
  Math.max(90, 560 * 0.86 ** (wave - 1));
export const bombEveryMs = (wave: number) =>
  Math.max(140, 1100 * 0.84 ** (wave - 1));
export const bombSpeed = (wave: number) =>
  Math.min(230, 90 * 1.09 ** (wave - 1));
/** From wave 4, every few waves one more bomb per volley. */
const bombsPerVolley = (wave: number) => 1 + Math.floor((wave - 1) / 3);
export const PIERCE_MS = 10_000;
export const SHIELD_MS = 10_000;
export const MAX_SHOTS = 5;
export const MAX_ARMOUR = 4;
export const SHIELD_TOP = SHIP_Y - 34;
export const SHIELD_CELL = 2;
export const UFO_Y = 24;
export const UFO_SPEED = 40;
export const MAX_RAPID = 5;
// Share of each power-up among the drops, in percent: the extra shot and invincibility are the rare ones, a life is 10%.
export const POWER_WEIGHTS: [PowerKind, number][] = [
  ["multi", 20],
  ["rapid", 30],
  ["pierce", 33],
  ["shield", 7],
  ["heart", 10],
];
const WEIGHT_TOTAL = POWER_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
export function randomPower(): PowerKind {
  let roll = Math.random() * WEIGHT_TOTAL;
  for (const [kind, weight] of POWER_WEIGHTS)
    if ((roll -= weight) < 0) return kind;
  return "rapid";
}
const NUKE_CHANCE = 0.01;

// A shield: 2×2 cells on this mask, chipped one cell (plus a neighbour) at a time.
export const SHIELD_MASK = [
  "..#######..",
  ".#########.",
  "###########",
  "###########",
  "###########",
  "####...####",
  "###.....###",
];

/** What one player is doing this step. `touchX` (field units) steers the ship and fires while held. */
export interface ShipInput {
  left: boolean;
  right: boolean;
  fire: boolean;
  touchX: number | null;
}
export const idleInput = (): ShipInput => ({
  left: false,
  right: false,
  fire: false,
  touchX: null,
});

/** Short centre-screen messages; the client turns them into text in its language. */
export type Banner =
  | { kind: "wave"; n: number }
  | { kind: "points"; n: number }
  | { kind: "missed" }
  | { kind: "shots"; n: number }
  | { kind: "rapid"; n: number }
  | { kind: "power"; power: PowerKind };

export type Invader = {
  col: number;
  row: number;
  alive: boolean;
  hp: number;
  hitAt: number;
};
/**
 * `pierceLeft`: invaders the shot may still pass through; `hits` keeps it from hitting one twice. A
 * `special` shot is fast, drills through shields, and is no volley (it never counts as a miss).
 */
export type Shot = {
  ship: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  volley: number;
  pierce: boolean;
  pierceLeft: number;
  hits: Set<Invader>;
  special?: boolean;
};
type Bomb = { x: number; y: number; vy: number };
type Drop = { x: number; y: number; kind: PowerKind };
export type Box = { x: number; y: number; w: number; h: number };
export type Cell = { x: number; y: number; alive: boolean };
export type Ship = {
  x: number;
  hitUntil: number;
  fireCooldown: number;
  /** Volleys in a row that hit; the special is charged once it reaches SPECIAL_STREAK. */
  streak: number;
  special: boolean;
  /** When fire was pressed (the special goes after SPECIAL_HOLD_MS held); null while released. */
  heldSince: number | null;
  /**
   * Co-op only: where the ship is on its player's screen right now, which runs a little ahead of `x` (the
   * server learns of each move half a round trip late). Bombs and power-ups are checked against it.
   */
  hitX?: number;
};

export interface InvadersState {
  invaders: Invader[];
  gridX: number;
  gridY: number;
  march: number;
  marchTimer: number;
  animFrame: number;
  wave: number;
  ships: Ship[];
  lives: number;
  score: number;
  best: number;
  shots: Shot[];
  bombs: Bomb[];
  drops: Drop[];
  bombTimer: number;
  over: boolean;
  banner: Banner | null;
  bannerUntil: number;
  shields: Cell[];
  ufo: { x: number; dir: number } | null;
  ufoAt: number;
  flashUntil: number;
  shotCount: number;
  rapidLevel: number;
  pierceUntil: number;
  shieldUntil: number;
  volleySeq: number;
  volleyHit: Set<number>;
  /** Volleys that hit an invader or the saucer (a shield does not count for the special). */
  volleyScored: Set<number>;
  misses: number;
  /** Fire held on the previous step, per ship: a fresh press restarts a finished game. */
  fireWas: boolean[];
}

const startX = (players: number, i: number) => (W * (i + 1)) / (players + 1);
export const newShip = (x: number): Ship => ({
  x,
  hitUntil: 0,
  fireCooldown: 0,
  streak: 0,
  special: false,
  heldSince: null,
});

export function createInvaders(players = 1): InvadersState {
  const st: InvadersState = {
    invaders: [],
    gridX: 0,
    gridY: 0,
    march: 1,
    marchTimer: 0,
    animFrame: 0,
    wave: 1,
    ships: Array.from({ length: players }, (_, i) =>
      newShip(startX(players, i)),
    ),
    lives: 3,
    score: 0,
    best: 0,
    shots: [],
    bombs: [],
    drops: [],
    bombTimer: 0,
    over: false,
    banner: null,
    bannerUntil: 0,
    shields: [],
    ufo: null,
    ufoAt: 0,
    flashUntil: 0,
    shotCount: 1,
    rapidLevel: 0,
    pierceUntil: 0,
    shieldUntil: 0,
    volleySeq: 0,
    volleyHit: new Set(),
    volleyScored: new Set(),
    misses: 0,
    fireWas: Array.from({ length: players }, () => false),
  };
  newWave(st, 0);
  return st;
}

const banner = (st: InvadersState, b: Banner, now: number, ms = 1300) => {
  st.banner = b;
  st.bannerUntil = now + ms;
};

function newWave(st: InvadersState, now: number) {
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
  st.shields = [];
  for (let k = 0; k < 4; k++) {
    const left = Math.round(
      (W * (k + 1)) / 5 - (SHIELD_MASK[0].length * SHIELD_CELL) / 2,
    );
    SHIELD_MASK.forEach((line, r) =>
      [...line].forEach(
        (ch, c) =>
          ch === "#" &&
          st.shields.push({
            x: left + c * SHIELD_CELL,
            y: SHIELD_TOP + r * SHIELD_CELL,
            alive: true,
          }),
      ),
    );
  }
  st.ufo = null;
  st.ufoAt = now + 15_000 + Math.random() * 10_000;
  st.gridX = 20;
  st.gridY = 36 + Math.min(st.wave - 1, 6) * 8;
  st.march = 1;
  st.bombs = [];
  st.drops = [];
  st.shots = [];
  banner(st, { kind: "wave", n: st.wave }, now);
}

export function restartInvaders(st: InvadersState, now: number) {
  st.best = Math.max(st.best, st.score);
  st.wave = 1;
  st.lives = 3;
  st.score = 0;
  st.misses = 0;
  st.shotCount = 1;
  st.rapidLevel = 0;
  st.pierceUntil = 0;
  st.shieldUntil = 0;
  st.over = false;
  st.ships.forEach((s, i) => {
    s.x = startX(st.ships.length, i);
    s.hitUntil = 0;
    s.streak = 0;
    s.special = false;
  });
  newWave(st, now);
}

const piercing = (st: InvadersState, now: number) => now < st.pierceUntil;
const shielded = (st: InvadersState, now: number) => now < st.shieldUntil;
const alive = (st: InvadersState) => st.invaders.filter((i) => i.alive);
const invaderBox = (st: InvadersState, i: Invader): Box => ({
  x: st.gridX + i.col * GAP_X,
  y: st.gridY + i.row * GAP_Y,
  w: 11,
  h: 8,
});
const inside = (p: { x: number; y: number }, b: Box) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
export const shipBox = (x: number): Box => ({
  x: x - 7,
  y: SHIP_Y - 4,
  w: 13,
  h: 8,
});

function fire(st: InvadersState, index: number, now: number) {
  const ship = st.ships[index];
  if (st.over || now < ship.fireCooldown) return;
  // Base: one volley per ship on screen at a time, like the arcade. Rapid nudges the gun a little per
  // level: slightly faster shots and cooldown, one more volley on screen every two levels.
  const volleysOnScreen = new Set(
    st.shots.filter((s) => s.ship === index).map((s) => s.volley),
  ).size;
  if (volleysOnScreen >= 1 + Math.ceil(st.rapidLevel / 2)) return;
  const volley = ++st.volleySeq;
  const vy = -shotSpeed(st.rapidLevel);
  const pierce = piercing(st, now);
  // Extra shots fan out to the sides, a wider angle the further from the middle.
  for (let i = 0; i < st.shotCount; i++) {
    const k = i - (st.shotCount - 1) / 2;
    st.shots.push({
      ship: index,
      x: ship.x + k * 3,
      y: SHOT_START_Y,
      vx: k * 34,
      vy,
      volley,
      pierce,
      pierceLeft: pierce ? 1 : 0,
      hits: new Set(),
    });
  }
  ship.fireCooldown = now + fireCooldownMs(st.rapidLevel);
}

function fireSpecial(st: InvadersState, index: number) {
  st.shots.push({
    ship: index,
    x: st.ships[index].x,
    y: SHOT_START_Y,
    vx: 0,
    vy: -SPECIAL_SPEED,
    volley: 0,
    pierce: true,
    pierceLeft: SPECIAL_PIERCE - 1,
    hits: new Set(),
    special: true,
  });
}

function loseLife(st: InvadersState, now: number, ship?: Ship) {
  if (shielded(st, now)) return;
  st.lives--;
  // A life lost costs an upgrade too: an extra shot first, then a rapid level.
  if (st.shotCount > 1) st.shotCount--;
  else if (st.rapidLevel > 0) st.rapidLevel--;
  for (const s of ship ? [ship] : st.ships) s.hitUntil = now + 1200;
  if (st.lives <= 0) end(st);
}

/**
 * A ship's volley is over: one that hit an invader adds to the ship's streak (five charge the special),
 * anything else starts it again.
 */
export function tallyVolley(ship: Ship, scored: boolean) {
  if (!scored) {
    ship.streak = 0;
    return;
  }
  if (ship.special) return;
  if (++ship.streak >= SPECIAL_STREAK) {
    ship.streak = 0;
    ship.special = true;
  }
}

/**
 * Fire held: a fresh press starts the hold; held long enough with the special charged, it goes. True
 * when the special was fired (`launch` puts the shot on the field).
 */
export function holdSpecial(
  ship: Ship,
  pressed: boolean,
  now: number,
  launch: () => void,
): boolean {
  if (!pressed) {
    ship.heldSince = null;
    return false;
  }
  ship.heldSince ??= now;
  if (!ship.special || now - ship.heldSince < SPECIAL_HOLD_MS) return false;
  ship.special = false;
  // One special per hold: release and hold again for the next.
  ship.heldSince = Infinity;
  launch();
  return true;
}

/** A volley whose last shot just left the field without any hit counts as a miss. */
function settleVolley(
  st: InvadersState,
  volley: number,
  ship: number,
  now: number,
) {
  if (st.shots.some((s) => s.volley === volley)) return;
  const scored = st.volleyScored.delete(volley);
  if (st.ships[ship]) tallyVolley(st.ships[ship], scored);
  if (st.volleyHit.delete(volley)) return;
  st.misses++;
  if (st.misses >= MISSES_PER_LIFE) {
    st.misses = 0;
    if (shielded(st, now)) return;
    banner(st, { kind: "missed" }, now, 1500);
    loseLife(st, now);
  }
}

function collect(st: InvadersState, kind: PowerKind, now: number) {
  if (kind === "multi") st.shotCount = Math.min(MAX_SHOTS, st.shotCount + 1);
  if (kind === "rapid") st.rapidLevel = Math.min(MAX_RAPID, st.rapidLevel + 1);
  if (kind === "pierce")
    st.pierceUntil = Math.max(now, st.pierceUntil) + PIERCE_MS;
  if (kind === "shield")
    st.shieldUntil = Math.max(now, st.shieldUntil) + SHIELD_MS;
  if (kind === "heart") st.lives = Math.min(MAX_LIVES, st.lives + 1);
  if (kind === "nuke") {
    // Half the remaining hits off every invader (rounded up), so the one-hit ones fall at once.
    st.flashUntil = now + 220;
    for (const i of alive(st)) {
      i.hp -= Math.ceil(i.hp / 2);
      i.hitAt = now;
      if (i.hp <= 0) {
        i.alive = false;
        st.score += (ROWS - i.row) * 10 * st.wave;
      }
    }
  }
  banner(
    st,
    kind === "multi"
      ? { kind: "shots", n: st.shotCount }
      : kind === "rapid"
        ? { kind: "rapid", n: st.rapidLevel }
        : { kind: "power", power: kind },
    now,
  );
}

/** Knocks out the shield cell under `p` (and `extra` neighbours); true when it hit one. */
function chip(st: InvadersState, p: { x: number; y: number }, extra = 1) {
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
  for (let k = 0; k < extra && near.length; k++)
    near.splice(Math.floor(Math.random() * near.length), 1)[0].alive = false;
  return true;
}

function end(st: InvadersState) {
  st.over = true;
  st.best = Math.max(st.best, st.score);
}

/**
 * Where a ship at `x` is after `dt` ms of `input`: keys move it at a steady speed, a finger pulls it
 * there a little faster. Shared with the co-op browser, which moves its own ship ahead of the server.
 */
export function moveShip(x: number, input: ShipInput, dt: number): number {
  const s = dt / 1000;
  if (input.touchX !== null)
    x +=
      Math.sign(input.touchX - x) *
      Math.min(Math.abs(input.touchX - x), 140 * s);
  else x += ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 110 * s;
  return Math.max(8, Math.min(W - 8, x));
}

/** Pause between volleys of one ship, by rapid-fire level. */
export const fireCooldownMs = (rapidLevel: number) =>
  Math.max(130, 220 - rapidLevel * 18);
/** A volley's upward speed, by rapid-fire level. */
export const shotSpeed = (rapidLevel: number) => 260 + rapidLevel * 20;
/** Where a ship's shot starts. */
export const SHOT_START_Y = SHIP_Y - 6;
/** Fields per entry in `InvadersView.shots` and `.bombs`. */
export const SHOT_STRIDE = 6;
export const BOMB_STRIDE = 3;
/** How fast power-ups fall. */
export const DROP_SPEED = 45;

/**
 * Advances the game by `dt` ms (keep it at 16 or less, so a shot cannot jump over an 8 px invader).
 * `inputs[i]` drives ship i. On a finished game, a fresh fire press from anyone restarts it.
 */
export function stepInvaders(
  st: InvadersState,
  inputs: ShipInput[],
  now: number,
  dt: number,
) {
  if (st.over) {
    inputs.forEach((input, i) => {
      const pressed = input.fire || input.touchX !== null;
      if (pressed && !st.fireWas[i]) restartInvaders(st, now);
      st.fireWas[i] = pressed;
    });
    return;
  }
  const s = dt / 1000;

  // Ships: move, and fire while the button (or the finger) is held; cooldown and the volley limit pace it.
  st.ships.forEach((ship, i) => {
    const input = inputs[i] ?? idleInput();
    ship.x = moveShip(ship.x, input, dt);
    const pressed = input.fire || input.touchX !== null;
    if (pressed) fire(st, i, now);
    holdSpecial(ship, pressed, now, () => fireSpecial(st, i));
    st.fireWas[i] = pressed;
  });

  // March: the fewer left, the faster; each wave starts quicker.
  const living = alive(st);
  const interval = Math.max(
    30,
    marchBaseMs(st.wave) * (living.length / (COLS * ROWS)),
  );
  st.marchTimer += dt;
  if (st.marchTimer >= interval && living.length) {
    st.marchTimer = 0;
    st.animFrame ^= 1;
    const xs = living.map((i) => st.gridX + i.col * GAP_X);
    const edge =
      st.march > 0
        ? Math.max(...xs) + 11 + 3 >= W - 4
        : Math.min(...xs) - 3 <= 4;
    if (edge) {
      st.gridY += 6;
      st.march = -st.march;
    } else st.gridX += 3 * st.march;
  }

  // The saucer: crosses the top every 15 to 25 s.
  if (!st.ufo && now >= st.ufoAt)
    st.ufo = Math.random() < 0.5 ? { x: -16, dir: 1 } : { x: W, dir: -1 };
  if (st.ufo) {
    st.ufo.x += st.ufo.dir * UFO_SPEED * s;
    if (st.ufo.x < -20 || st.ufo.x > W + 4) {
      st.ufo = null;
      st.ufoAt = now + 15_000 + Math.random() * 10_000;
    }
  }

  // Player shots. The special moves in short hops, so it cannot skip over an invader.
  const gone = new Map<number, number>();
  st.shots = st.shots.filter((shot) => {
    const hops = shot.special ? Math.ceil((Math.abs(shot.vy) * s) / 6) : 1;
    for (let k = 0; k < hops; k++) {
      const result = moveShot(shot, s / hops);
      if (result === "gone") return false;
    }
    return true;
  });
  for (const [volley, ship] of gone) settleVolley(st, volley, ship, now);

  /** One hop of a shot: "gone" when it hit something that stops it, or left the field. */
  function moveShot(shot: Shot, s: number): "gone" | "flying" {
    const stop = () => {
      if (!shot.special) gone.set(shot.volley, shot.ship);
      return "gone" as const;
    };
    shot.x += shot.vx * s;
    shot.y += shot.vy * s;
    if (st.ufo && inside(shot, { x: st.ufo.x, y: UFO_Y, w: 16, h: 7 })) {
      const points = 100 * st.wave;
      st.score += points;
      st.drops.push({
        x: st.ufo.x + 8,
        y: UFO_Y + 4,
        kind: Math.random() < NUKE_CHANCE ? "nuke" : randomPower(),
      });
      banner(st, { kind: "points", n: points }, now);
      st.ufo = null;
      st.ufoAt = now + 15_000 + Math.random() * 10_000;
      st.volleyHit.add(shot.volley);
      st.volleyScored.add(shot.volley);
      st.misses = 0;
      return stop();
    }
    // The shields stop the players' shots too (no miss counted: the shot hit something); the special
    // drills through them.
    if (chip(st, shot)) {
      if (!shot.special) {
        st.volleyHit.add(shot.volley);
        return stop();
      }
    }
    for (const target of alive(st)) {
      if (shot.hits.has(target) || !inside(shot, invaderBox(st, target)))
        continue;
      shot.hits.add(target);
      st.volleyHit.add(shot.volley);
      st.volleyScored.add(shot.volley);
      st.misses = 0;
      // The special hits twice as hard.
      target.hp -= shot.special ? 2 : 1;
      target.hitAt = now;
      if (target.hp <= 0) {
        target.alive = false;
        st.score += (ROWS - target.row) * 10 * st.wave;
        if (Math.random() < dropChance(st.wave)) {
          const b = invaderBox(st, target);
          st.drops.push({ x: b.x + 5, y: b.y + 4, kind: randomPower() });
        }
      }
      // A piercing shot goes through the first invader it hits and stops at the second.
      if (shot.pierceLeft > 0) {
        shot.pierceLeft--;
        continue;
      }
      return stop();
    }
    return shot.y < 0 || shot.x < 0 || shot.x > W ? stop() : "flying";
  }

  // Bombs from the lowest invader of a random column: more often and faster every wave.
  st.bombTimer -= dt;
  const stillAlive = alive(st);
  if (st.bombTimer <= 0 && stillAlive.length) {
    st.bombTimer = bombEveryMs(st.wave) * (0.6 + Math.random() * 0.8);
    const cols = [...new Set(stillAlive.map((i) => i.col))];
    for (let n = 0; n < Math.min(bombsPerVolley(st.wave), cols.length); n++) {
      const col = cols.splice(Math.floor(Math.random() * cols.length), 1)[0];
      const shooter = stillAlive
        .filter((i) => i.col === col)
        .sort((a, b) => b.row - a.row)[0];
      const b = invaderBox(st, shooter);
      st.bombs.push({ x: b.x + 5, y: b.y + 8, vy: bombSpeed(st.wave) });
    }
  }
  st.bombs = st.bombs.filter((b) => {
    b.y += b.vy * s;
    const hit = st.ships.find(
      (ship) => now > ship.hitUntil && inside(b, shipBox(ship.hitX ?? ship.x)),
    );
    if (hit) {
      loseLife(st, now, hit);
      return false;
    }
    return b.y < H;
  });

  // Power-ups fall; any ship catches them for the team.
  st.drops = st.drops.filter((d) => {
    d.y += DROP_SPEED * s;
    const caught = st.ships.some((ship) => {
      const box = shipBox(ship.hitX ?? ship.x);
      return inside(d, {
        x: box.x - 3,
        y: box.y - 3,
        w: box.w + 6,
        h: box.h + 6,
      });
    });
    if (caught) {
      collect(st, d.kind, now);
      return false;
    }
    return d.y < H;
  });

  // Invaders marching through a shield wipe the cells they cover.
  for (const i of stillAlive) {
    const b = invaderBox(st, i);
    if (b.y + b.h < SHIELD_TOP) continue;
    for (const c of st.shields)
      if (
        c.alive &&
        c.x + SHIELD_CELL > b.x &&
        c.x < b.x + b.w &&
        c.y + SHIELD_CELL > b.y &&
        c.y < b.y + b.h
      )
        c.alive = false;
  }

  // Invaders reaching the ships' row end the game; a cleared field brings the next wave.
  if (stillAlive.some((i) => invaderBox(st, i).y + 8 >= SHIP_Y - 4)) end(st);
  if (!alive(st).length && !st.over) {
    st.wave++;
    newWave(st, now);
  }
}

/**
 * Everything the screen needs, as plain JSON: sent over the wire in co-op. Timers are "ms left", so the
 * two machines don't need synchronised clocks.
 */
export interface InvadersView {
  wave: number;
  score: number;
  best: number;
  lives: number;
  misses: number;
  shotCount: number;
  rapidLevel: number;
  pierceLeft: number;
  shieldLeft: number;
  flashLeft: number;
  gridX: number;
  gridY: number;
  animFrame: number;
  /** One entry per invader slot (row-major): hits left, 0 when dead. */
  hp: number[];
  /** Slots hit in the last 90 ms (they flash white). */
  flash: number[];
  /** `streak`: volleys in a row that hit (towards the special); `special`: charged. */
  ships: { x: number; blink: boolean; streak: number; special: boolean }[];
  /**
   * Flat [x, y, kind, vx, vy, ship, …] (SHOT_STRIDE per shot); kind 0 plain, 1 piercing, 2 the special;
   * speeds in units per second.
   */
  shots: number[];
  /** Flat [x, y, vy, …] (BOMB_STRIDE per bomb). */
  bombs: number[];
  drops: { x: number; y: number; kind: PowerKind }[];
  /** One char per shield cell, "1" standing, "0" chipped (cells are always in the same order). */
  shields: string;
  ufoX: number | null;
  /** -1 or 1: where the saucer is heading. */
  ufoDir: number;
  banner: Banner | null;
  over: boolean;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function viewInvaders(st: InvadersState, now: number): InvadersView {
  return {
    wave: st.wave,
    score: st.score,
    best: Math.max(st.best, st.score),
    lives: st.lives,
    misses: st.misses,
    shotCount: st.shotCount,
    rapidLevel: st.rapidLevel,
    pierceLeft: Math.max(0, st.pierceUntil - now),
    shieldLeft: Math.max(0, st.shieldUntil - now),
    flashLeft: Math.max(0, st.flashUntil - now),
    gridX: st.gridX,
    gridY: st.gridY,
    animFrame: st.animFrame,
    hp: st.invaders.map((i) => (i.alive ? i.hp : 0)),
    flash: st.invaders.flatMap((i, k) =>
      i.alive && now - i.hitAt < 90 ? [k] : [],
    ),
    ships: st.ships.map((s) => ({
      x: r1(s.x),
      blink: now < s.hitUntil && Math.floor(now / 120) % 2 === 1,
      streak: s.streak,
      special: s.special,
    })),
    shots: st.shots.flatMap((s) => [
      r1(s.x),
      r1(s.y),
      s.special ? 2 : s.pierce ? 1 : 0,
      r1(s.vx),
      r1(s.vy),
      s.ship,
    ]),
    bombs: st.bombs.flatMap((b) => [r1(b.x), r1(b.y), r1(b.vy)]),
    drops: st.drops.map((d) => ({ x: r1(d.x), y: r1(d.y), kind: d.kind })),
    shields: st.shields.map((c) => (c.alive ? "1" : "0")).join(""),
    ufoX: st.ufo ? r1(st.ufo.x) : null,
    ufoDir: st.ufo?.dir ?? 1,
    banner: now < st.bannerUntil ? st.banner : null,
    over: st.over,
  };
}

/** Shield cell positions, in the same order as `InvadersView.shields`. */
export function shieldLayout(): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const left = Math.round(
      (W * (k + 1)) / 5 - (SHIELD_MASK[0].length * SHIELD_CELL) / 2,
    );
    SHIELD_MASK.forEach((line, r) =>
      [...line].forEach(
        (ch, c) =>
          ch === "#" &&
          cells.push({
            x: left + c * SHIELD_CELL,
            y: SHIELD_TOP + r * SHIELD_CELL,
          }),
      ),
    );
  }
  return cells;
}

/** Invader slot k's box, for drawing a view. */
export const slotBox = (
  view: Pick<InvadersView, "gridX" | "gridY">,
  k: number,
): Box => ({
  x: view.gridX + (k % COLS) * GAP_X,
  y: view.gridY + Math.floor(k / COLS) * GAP_Y,
  w: 11,
  h: 8,
});
