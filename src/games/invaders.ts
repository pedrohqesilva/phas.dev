// Space Invaders on a 224×256 field (the arcade's), scaled to fit the screen on black.
// ← → or A D move, Space (or ↑ / W) fires; on touch the ship follows the finger and fires while held.
//
// Lives: three to start (five at most); a bomb costs one, and so do three volleys in a row that hit nothing.
// Waves: on wave N every invader takes N hits (4 at most), and they march, bomb more often and faster.
// Four shields stand above the ship: they stop (and chip away under) your shots, while the invaders'
// bombs go straight through them. They are rebuilt every wave.
// Now and then a saucer crosses the top: hitting it is worth 100 × the wave and always drops a power-up;
// 1 time in 100 that is the bomb "B", which takes half the remaining hits off every invader on the field.
// Losing a life also costs an upgrade (one extra shot first, then a rapid level).
// Power-ups, dropped now and then by a killed invader and caught with the ship:
//   "+" one more shot per volley, "R" a faster gun (both stack and last the whole game, waves included),
//   "P" for 10 s, shots that go through the first invader they hit, "I" 10 s of invincibility (no bomb or
//   miss costs a life), "♥" one life back.
import { openGame, type GameTexts } from "./shell.ts";

export type PowerKind = "multi" | "rapid" | "pierce" | "shield" | "heart" | "nuke";

export interface InvadersTexts extends GameTexts {
  over: string;
  restart: string;
  wave: (n: number) => string;
  score: string;
  best: string;
  missed: string;
  powers: Record<PowerKind, string>;
  shots: (n: number) => string;
  rapid: (n: number) => string;
}

const W = 224;
const H = 256;
const COLS = 8;
const ROWS = 5;
const GAP_X = 18;
const GAP_Y = 16;
const SHIP_Y = H - 24;
const MISSES_PER_LIFE = 3;
const MAX_LIVES = 5;
/** Drop chance per kill: 5% on wave 1, one point less each wave, never under 1%. */
const dropChance = (wave: number) => Math.max(0.01, 0.05 - (wave - 1) * 0.01);
/** Every wave starts faster and bombs more: these shrink by a fixed share per wave, with a floor. */
const marchBaseMs = (wave: number) => Math.max(90, 560 * 0.86 ** (wave - 1));
const bombEveryMs = (wave: number) => Math.max(140, 1100 * 0.84 ** (wave - 1));
const bombSpeed = (wave: number) => Math.min(230, 90 * 1.09 ** (wave - 1));
/** From wave 4, every few waves one more bomb per volley. */
const bombsPerVolley = (wave: number) => 1 + Math.floor((wave - 1) / 3);
const PIERCE_MS = 10_000;
const SHIELD_MS = 10_000;
const MAX_SHOTS = 5;
const MAX_ARMOUR = 4;
const SHIELD_TOP = SHIP_Y - 34;
const UFO_Y = 24;
const UFO_SPEED = 40;
const MAX_RAPID = 5;
// Share of each power-up among the drops, in percent: the extra shot and invincibility are the rare ones, a life is 10%.
const POWER_WEIGHTS: [PowerKind, number][] = [
  ["multi", 20],
  ["rapid", 30],
  ["pierce", 33],
  ["shield", 7],
  ["heart", 10],
];
const WEIGHT_TOTAL = POWER_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
function randomPower(): PowerKind {
  let roll = Math.random() * WEIGHT_TOTAL;
  for (const [kind, weight] of POWER_WEIGHTS) if ((roll -= weight) < 0) return kind;
  return "rapid";
}
const POWER_LETTER: Record<PowerKind, string> = { multi: "+", rapid: "R", pierce: "P", shield: "I", heart: "♥", nuke: "B" };
const NUKE_CHANCE = 0.01;

const sprite = (rows: string[]) => rows.map((r) => [...r].map((c) => c === "#"));
const INVADER = [
  sprite(["..#.....#..", "...#...#...", "..#######..", ".##.###.##.", "###########", "#.#######.#", "#.#.....#.#", "...##.##..."]),
  sprite(["..#.....#..", "#..#...#..#", "#.#######.#", "###.###.###", "###########", ".#########.", "..#.....#..", ".#.......#."]),
];
const UFO = sprite([".....######.....", "...##########...", "..############..", ".##.##.##.##.##.", "################", "..###..##..###..", "...#........#..."]);
// A shield: 2×2 cells on this mask, chipped one cell (plus a neighbour) at a time.
const SHIELD_MASK = ["..#######..", ".#########.", "###########", "###########", "###########", "####...####", "###.....###"];
const SHIELD_CELL = 2;
const SHIP = sprite(["......#......", ".....###.....", ".....###.....", ".###########.", "#############", "#############", "#############", "#############"]);

type Invader = { col: number; row: number; alive: boolean; hp: number; hitAt: number };
/** `pierceLeft`: invaders the shot may still pass through; `hits` keeps it from hitting one twice. */
type Shot = { x: number; y: number; vx: number; vy: number; volley: number; pierce: boolean; pierceLeft: number; hits: Set<Invader> };
type Bomb = { x: number; y: number; vy: number };
type Drop = { x: number; y: number; kind: PowerKind };
type Box = { x: number; y: number; w: number; h: number };
type Cell = { x: number; y: number; alive: boolean };

export function playInvaders(texts: InvadersTexts, onExit: (best: number) => void) {
  let scale = 1;
  let ox = 0;
  let oy = 0;

  let invaders: Invader[] = [];
  let gridX = 0;
  let gridY = 0;
  let march = 1;
  let marchTimer = 0;
  let animFrame = 0;
  let wave = 1;
  let shipX = W / 2;
  let lives = 3;
  let score = 0;
  let best = 0;
  let shots: Shot[] = [];
  let bombs: Bomb[] = [];
  let drops: Drop[] = [];
  let bombTimer = 0;
  let fireCooldown = 0;
  let hitUntil = 0;
  let over = false;
  let bannerText = "";
  let bannerUntil = 0;
  // Stacking upgrades (kept across waves) and the one timed power.
  let shields: Cell[] = [];
  let ufo: { x: number; dir: number } | null = null;
  let ufoAt = 0;
  let flashUntil = 0;
  let shotCount = 1;
  let rapidLevel = 0;
  let pierceUntil = 0;
  let shieldUntil = 0;
  // Volleys: one press fires one volley; it is a miss only when none of its shots hit.
  let volleySeq = 0;
  const volleyHit = new Set<number>();
  let misses = 0;
  const held = new Set<string>();
  let touchX: number | null = null;

  const shell = openGame({
    texts,
    onResize() {
      // Runs inside openGame on the first call, before `shell` exists: read the window.
      scale = Math.min(innerWidth / W, innerHeight / H) * 0.94;
      ox = (innerWidth - W * scale) / 2;
      oy = (innerHeight - H * scale) / 2;
    },
    onKey(key, down) {
      if (down) held.add(key);
      else held.delete(key);
      if (!down) return;
      if (over && key === " ") return restart();
      if (key === " " || key === "ArrowUp" || key === "w") fire(shell.now());
    },
    onTouch(x, _y, phase) {
      touchX = phase === "end" ? null : (x - ox) / scale;
      if (phase === "start" && over) restart();
    },
    onExit: () => onExit(Math.max(best, score)),
  });
  const { g } = shell;

  const banner = (text: string, now: number, ms = 1300) => {
    bannerText = text;
    bannerUntil = now + ms;
  };

  function newWave(now: number) {
    invaders = [];
    for (let row = 0; row < ROWS; row++)
      for (let col = 0; col < COLS; col++) invaders.push({ col, row, alive: true, hp: Math.min(wave, MAX_ARMOUR), hitAt: 0 });
    shields = [];
    for (let k = 0; k < 4; k++) {
      const left = Math.round((W * (k + 1)) / 5 - (SHIELD_MASK[0].length * SHIELD_CELL) / 2);
      SHIELD_MASK.forEach((line, r) =>
        [...line].forEach((ch, c) => ch === "#" && shields.push({ x: left + c * SHIELD_CELL, y: SHIELD_TOP + r * SHIELD_CELL, alive: true })),
      );
    }
    ufo = null;
    ufoAt = now + 15_000 + Math.random() * 10_000;
    gridX = 20;
    gridY = 36 + Math.min(wave - 1, 6) * 8;
    march = 1;
    bombs = [];
    drops = [];
    shots = [];
    banner(texts.wave(wave), now);
  }
  function restart() {
    const now = shell.now();
    best = Math.max(best, score);
    wave = 1;
    lives = 3;
    score = 0;
    misses = 0;
    shotCount = 1;
    rapidLevel = 0;
    pierceUntil = 0;
    shieldUntil = 0;
    over = false;
    shipX = W / 2;
    newWave(now);
  }
  newWave(0);

  const piercing = (now: number) => now < pierceUntil;
  const shielded = (now: number) => now < shieldUntil;

  function fire(now: number) {
    if (over || !shell.started || now < fireCooldown) return;
    // Base: one volley on screen at a time, like the arcade. Rapid nudges the gun a little per level:
    // slightly faster shots and cooldown, one more volley on screen every two levels.
    const volleysOnScreen = new Set(shots.map((s) => s.volley)).size;
    if (volleysOnScreen >= 1 + Math.ceil(rapidLevel / 2)) return;
    const volley = ++volleySeq;
    const vy = -(260 + rapidLevel * 20);
    const pierce = piercing(now);
    // Extra shots fan out to the sides, a wider angle the further from the middle.
    for (let i = 0; i < shotCount; i++) {
      const k = i - (shotCount - 1) / 2;
      shots.push({ x: shipX + k * 3, y: SHIP_Y - 6, vx: k * 34, vy, volley, pierce, pierceLeft: pierce ? 1 : 0, hits: new Set() });
    }
    fireCooldown = now + Math.max(130, 220 - rapidLevel * 18);
  }

  const alive = () => invaders.filter((i) => i.alive);
  const invaderBox = (i: Invader): Box => ({ x: gridX + i.col * GAP_X, y: gridY + i.row * GAP_Y, w: 11, h: 8 });
  const inside = (p: { x: number; y: number }, b: Box) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

  function loseLife(now: number) {
    if (shielded(now)) return;
    lives--;
    // A life lost costs an upgrade too: an extra shot first, then a rapid level.
    if (shotCount > 1) shotCount--;
    else if (rapidLevel > 0) rapidLevel--;
    hitUntil = now + 1200;
    if (lives <= 0) end();
  }

  /** A volley whose last shot just left the field without any hit counts as a miss. */
  function settleVolley(volley: number, now: number) {
    if (shots.some((s) => s.volley === volley)) return;
    if (volleyHit.delete(volley)) return;
    misses++;
    if (misses >= MISSES_PER_LIFE) {
      misses = 0;
      if (shielded(now)) return;
      banner(texts.missed, now, 1500);
      loseLife(now);
    }
  }

  function collect(kind: PowerKind, now: number) {
    if (kind === "multi") shotCount = Math.min(MAX_SHOTS, shotCount + 1);
    if (kind === "rapid") rapidLevel = Math.min(MAX_RAPID, rapidLevel + 1);
    if (kind === "pierce") pierceUntil = Math.max(now, pierceUntil) + PIERCE_MS;
    if (kind === "shield") shieldUntil = Math.max(now, shieldUntil) + SHIELD_MS;
    if (kind === "heart") lives = Math.min(MAX_LIVES, lives + 1);
    if (kind === "nuke") {
      // Half the remaining hits off every invader (rounded up), so the one-hit ones fall at once.
      flashUntil = now + 220;
      for (const i of alive()) {
        i.hp -= Math.ceil(i.hp / 2);
        i.hitAt = now;
        if (i.hp <= 0) {
          i.alive = false;
          score += (ROWS - i.row) * 10 * wave;
        }
      }
    }
    banner(
      kind === "multi" ? texts.shots(shotCount) : kind === "rapid" ? texts.rapid(rapidLevel) : texts.powers[kind],
      now,
    );
  }

  function step(now: number, dt: number) {
    const s = dt / 1000;
    // Ship.
    const left = held.has("ArrowLeft") || held.has("a");
    const right = held.has("ArrowRight") || held.has("d");
    if (touchX !== null) {
      shipX += Math.sign(touchX - shipX) * Math.min(Math.abs(touchX - shipX), 140 * s);
      fire(now);
    } else shipX += ((right ? 1 : 0) - (left ? 1 : 0)) * 110 * s;
    shipX = Math.max(8, Math.min(W - 8, shipX));
    // Holding fire keeps shooting once the gun has a rapid level.
    if (rapidLevel && (held.has(" ") || held.has("ArrowUp") || held.has("w"))) fire(now);

    // March: the fewer left, the faster; each wave starts quicker.
    const living = alive();
    const interval = Math.max(30, marchBaseMs(wave) * (living.length / (COLS * ROWS)));
    marchTimer += dt;
    if (marchTimer >= interval && living.length) {
      marchTimer = 0;
      animFrame ^= 1;
      const xs = living.map((i) => gridX + i.col * GAP_X);
      const edge = march > 0 ? Math.max(...xs) + 11 + 3 >= W - 4 : Math.min(...xs) - 3 <= 4;
      if (edge) {
        gridY += 6;
        march = -march;
      } else gridX += 3 * march;
    }

    // The saucer: crosses the top every 15 to 25 s.
    if (!ufo && now >= ufoAt) ufo = Math.random() < 0.5 ? { x: -16, dir: 1 } : { x: W, dir: -1 };
    if (ufo) {
      ufo.x += ufo.dir * UFO_SPEED * s;
      if (ufo.x < -20 || ufo.x > W + 4) {
        ufo = null;
        ufoAt = now + 15_000 + Math.random() * 10_000;
      }
    }

    // Player shots.
    const gone = new Set<number>();
    shots = shots.filter((shot) => {
      shot.x += shot.vx * s;
      shot.y += shot.vy * s;
      if (ufo && inside(shot, { x: ufo.x, y: UFO_Y, w: 16, h: 7 })) {
        const points = 100 * wave;
        score += points;
        drops.push({ x: ufo.x + 8, y: UFO_Y + 4, kind: Math.random() < NUKE_CHANCE ? "nuke" : randomPower() });
        banner(`+${points}`, now);
        ufo = null;
        ufoAt = now + 15_000 + Math.random() * 10_000;
        volleyHit.add(shot.volley);
        misses = 0;
        gone.add(shot.volley);
        return false;
      }
      // Your own shields stop your shots too (no miss counted: the shot hit something).
      if (chip(shot)) {
        volleyHit.add(shot.volley);
        gone.add(shot.volley);
        return false;
      }
      for (const target of alive()) {
        if (shot.hits.has(target) || !inside(shot, invaderBox(target))) continue;
        shot.hits.add(target);
        volleyHit.add(shot.volley);
        misses = 0;
        target.hp--;
        target.hitAt = now;
        if (target.hp <= 0) {
          target.alive = false;
          score += (ROWS - target.row) * 10 * wave;
          if (Math.random() < dropChance(wave)) {
            const b = invaderBox(target);
            drops.push({ x: b.x + 5, y: b.y + 4, kind: randomPower() });
          }
        }
        // A piercing shot goes through the first invader it hits and stops at the second.
        if (shot.pierceLeft > 0) {
          shot.pierceLeft--;
          continue;
        }
        gone.add(shot.volley);
        return false;
      }
      const out = shot.y < 0 || shot.x < 0 || shot.x > W;
      if (out) gone.add(shot.volley);
      return !out;
    });
    for (const v of gone) settleVolley(v, now);

    // Bombs from the lowest invader of a random column: more often and faster every wave.
    bombTimer -= dt;
    const stillAlive = alive();
    if (bombTimer <= 0 && stillAlive.length) {
      bombTimer = bombEveryMs(wave) * (0.6 + Math.random() * 0.8);
      const cols = [...new Set(stillAlive.map((i) => i.col))];
      for (let n = 0; n < Math.min(bombsPerVolley(wave), cols.length); n++) {
        const col = cols.splice(Math.floor(Math.random() * cols.length), 1)[0];
        const shooter = stillAlive.filter((i) => i.col === col).sort((a, b) => b.row - a.row)[0];
        const b = invaderBox(shooter);
        bombs.push({ x: b.x + 5, y: b.y + 8, vy: bombSpeed(wave) });
      }
    }
    const shipBox: Box = { x: shipX - 7, y: SHIP_Y - 4, w: 13, h: 8 };
    bombs = bombs.filter((b) => {
      b.y += b.vy * s;
      if (now > hitUntil && inside(b, shipBox)) {
        loseLife(now);
        return false;
      }
      return b.y < H;
    });

    // Power-ups fall; the ship catches them.
    const catchBox: Box = { x: shipBox.x - 3, y: shipBox.y - 3, w: shipBox.w + 6, h: shipBox.h + 6 };
    drops = drops.filter((d) => {
      d.y += 45 * s;
      if (inside(d, catchBox)) {
        collect(d.kind, now);
        return false;
      }
      return d.y < H;
    });

    // Invaders marching through a shield wipe the cells they cover.
    for (const i of stillAlive) {
      const b = invaderBox(i);
      if (b.y + b.h < SHIELD_TOP) continue;
      for (const c of shields) if (c.alive && c.x + SHIELD_CELL > b.x && c.x < b.x + b.w && c.y + SHIELD_CELL > b.y && c.y < b.y + b.h) c.alive = false;
    }

    // Invaders reaching the ship's row end the game; a cleared field brings the next wave.
    if (stillAlive.some((i) => invaderBox(i).y + 8 >= SHIP_Y - 4)) end();
    if (!alive().length && !over) {
      wave++;
      newWave(now);
    }
  }

  /** Knocks out the shield cell under `p` (and `extra` neighbours); true when it hit one. */
  function chip(p: { x: number; y: number }, extra = 1) {
    const hit = shields.find((c) => c.alive && p.x >= c.x && p.x < c.x + SHIELD_CELL && p.y >= c.y && p.y < c.y + SHIELD_CELL);
    if (!hit) return false;
    hit.alive = false;
    const near = shields.filter((c) => c.alive && Math.abs(c.x - hit.x) <= SHIELD_CELL && Math.abs(c.y - hit.y) <= SHIELD_CELL);
    for (let k = 0; k < extra && near.length; k++) near.splice(Math.floor(Math.random() * near.length), 1)[0].alive = false;
    return true;
  }

  function end() {
    over = true;
    best = Math.max(best, score);
  }

  function px(bits: boolean[][], x: number, y: number) {
    for (let r = 0; r < bits.length; r++)
      for (let c = 0; c < bits[r].length; c++) if (bits[r][c]) g.fillRect(x + c, y + r, 1, 1);
  }
  function text(str: string, x: number, y: number, size: number, align: CanvasTextAlign = "left") {
    g.font = `${size}px "Geist Mono Variable", ui-monospace, monospace`;
    g.textAlign = align;
    g.fillText(str, x, y);
  }

  function draw(now: number) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = devicePixelRatio || 1;
    g.fillStyle = "#000";
    g.fillRect(0, 0, shell.canvas.width, shell.canvas.height);
    g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    g.fillStyle = shell.accent;

    // HUD: score and best on the left, lives and the miss streak on the right, upgrades in the middle.
    text(`${texts.score} ${String(score).padStart(5, "0")}`, 4, 10, 7);
    text(`${texts.best} ${String(Math.max(best, score)).padStart(5, "0")}`, 4, 19, 6);
    text("♥".repeat(Math.max(0, lives)), W - 4, 10, 8, "right");
    g.globalAlpha = 0.6;
    text("×".repeat(misses), W - 4, 19, 7, "right");
    const upgrades = [
      shotCount > 1 && `×${shotCount}`,
      rapidLevel > 0 && `R${rapidLevel}`,
      piercing(now) && `P ${Math.ceil((pierceUntil - now) / 1000)}s`,
      shielded(now) && `I ${Math.ceil((shieldUntil - now) / 1000)}s`,
    ].filter(Boolean);
    text(upgrades.join("  "), W / 2, 10, 7, "center");
    g.globalAlpha = 1;
    g.fillRect(0, H - 6, W, 1);

    for (const i of alive()) {
      const b = invaderBox(i);
      // Just hit but still standing: a short white flash. Hits left beyond one: dots under it.
      g.globalAlpha = 1 - i.row * 0.1;
      g.fillStyle = now - i.hitAt < 90 ? "#fff" : shell.accent;
      px(INVADER[animFrame], b.x, b.y);
      g.fillStyle = shell.accent;
      for (let k = 1; k < i.hp && k < 6; k++) g.fillRect(b.x + k * 2 - 1, b.y + 9.5, 1, 1);
    }
    g.globalAlpha = 1;
    if (!(now < hitUntil && Math.floor(now / 120) % 2)) px(SHIP, Math.round(shipX - 6), SHIP_Y - 4);
    if (shielded(now)) {
      // Invincible: a blinking outline around the ship, faster in its last two seconds.
      const fast = shieldUntil - now < 2000;
      g.globalAlpha = Math.floor(now / (fast ? 90 : 220)) % 2 ? 0.9 : 0.4;
      g.strokeStyle = shell.accent;
      g.lineWidth = 0.7;
      g.strokeRect(Math.round(shipX - 9), SHIP_Y - 7, 18, 13);
      g.globalAlpha = 1;
    }
    for (const s of shots) g.fillRect(s.x, s.y, s.pierce ? 2 : 1, 5);
    for (const b of bombs) g.fillRect(b.x, b.y, 1, 4);
    if (now < flashUntil) {
      g.globalAlpha = ((flashUntil - now) / 220) * 0.5;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, W, H);
      g.fillStyle = shell.accent;
      g.globalAlpha = 1;
    }
    g.globalAlpha = 0.75;
    for (const c of shields) if (c.alive) g.fillRect(c.x, c.y, SHIELD_CELL, SHIELD_CELL);
    g.globalAlpha = 1;
    if (ufo) {
      g.fillStyle = "#fff";
      px(UFO, Math.round(ufo.x), UFO_Y);
      g.fillStyle = shell.accent;
    }
    for (const d of drops) {
      // A small capsule with the power-up's letter; it blinks so it reads as a pickup.
      g.globalAlpha = Math.floor(now / 180) % 2 ? 1 : 0.55;
      g.strokeStyle = shell.accent;
      g.lineWidth = 0.6;
      g.strokeRect(d.x - 4, d.y - 4, 8, 8);
      text(POWER_LETTER[d.kind], d.x, d.y + 2.5, 6, "center");
      g.globalAlpha = 1;
    }

    if (now < bannerUntil && !over) text(bannerText, W / 2, H / 2, 9, "center");
    if (over) {
      text(texts.over, W / 2, H / 2 - 10, 14, "center");
      text(`${texts.score} ${score}`, W / 2, H / 2 + 4, 8, "center");
      text(texts.restart, W / 2, H / 2 + 18, 7, "center");
    }
  }

  shell.loop((now, dt) => {
    // Fixed small steps: a long frame (a slow device, a throttled tab) must not let a shot jump over
    // an 8 px invader.
    if (shell.started && !shell.paused && !over)
      for (let left = dt; left > 0 && !over; left -= 16) step(now - Math.max(0, left - 16), Math.min(16, left));
    draw(now);
  });
}
