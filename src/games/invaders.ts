// Space Invaders on screen: the arcade's 224×256 field scaled to fit on black. The rules live in
// invaders-sim.ts; here are the controls and the drawing.
// ← → or A D move, Space (or ↑ / W) fires; on touch the ship follows the finger and fires while held.
//
// Solo runs the simulation in the browser. Co-op runs it on the server: this side only sends what the
// player is pressing and draws the snapshots it gets back (your ship in the accent, your partner's white).
import {
  createInvaders,
  H,
  idleInput,
  restartInvaders,
  SHIELD_CELL,
  shieldLayout,
  SHIP_Y,
  slotBox,
  stepInvaders,
  UFO_Y,
  viewInvaders,
  W,
  type Banner,
  type InvadersView,
  type PowerKind,
  type ShipInput,
} from "./invaders-sim.ts";
import { connect } from "./net.ts";
import { openGame, type GameTexts, type Shell } from "./shell.ts";

export type { PowerKind } from "./invaders-sim.ts";

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

/** Extra lines for co-op: the waiting screen, the ship labels and what can go wrong with the connection. */
export interface CoopTexts {
  waiting: string;
  /** "{code}" is replaced with the room code. */
  share: string;
  partnerLeft: string;
  disconnected: string;
  full: string;
  notFound: string;
  you: string;
  partner: string;
}

const POWER_LETTER: Record<PowerKind, string> = {
  multi: "+",
  rapid: "R",
  pierce: "P",
  shield: "I",
  heart: "♥",
  nuke: "B",
};

const sprite = (rows: string[]) =>
  rows.map((r) => [...r].map((c) => c === "#"));
const INVADER = [
  sprite([
    "..#.....#..",
    "...#...#...",
    "..#######..",
    ".##.###.##.",
    "###########",
    "#.#######.#",
    "#.#.....#.#",
    "...##.##...",
  ]),
  sprite([
    "..#.....#..",
    "#..#...#..#",
    "#.#######.#",
    "###.###.###",
    "###########",
    ".#########.",
    "..#.....#..",
    ".#.......#.",
  ]),
];
const UFO = sprite([
  ".....######.....",
  "...##########...",
  "..############..",
  ".##.##.##.##.##.",
  "################",
  "..###..##..###..",
  "...#........#...",
]);
const SHIP = sprite([
  "......#......",
  ".....###.....",
  ".....###.....",
  ".###########.",
  "#############",
  "#############",
  "#############",
  "#############",
]);
const SHIELDS = shieldLayout();

/** Keyboard and touch, turned into a ShipInput. */
function controls() {
  const held = new Set<string>();
  let touchX: number | null = null;
  return {
    key(key: string, down: boolean) {
      if (down) held.add(key);
      else held.delete(key);
    },
    touch(x: number | null) {
      touchX = x;
    },
    input(): ShipInput {
      return {
        left: held.has("ArrowLeft") || held.has("a"),
        right: held.has("ArrowRight") || held.has("d"),
        fire: held.has(" ") || held.has("ArrowUp") || held.has("w"),
        touchX,
      };
    },
  };
}

type Fit = { scale: number; ox: number; oy: number };

/** Scale and offset that fit the field on screen; `update` recomputes them on resize. */
function fit() {
  const f: Fit = { scale: 1, ox: 0, oy: 0 };
  const update = () => {
    f.scale = Math.min(innerWidth / W, innerHeight / H) * 0.94;
    f.ox = (innerWidth - W * f.scale) / 2;
    f.oy = (innerHeight - H * f.scale) / 2;
  };
  update();
  return { f, update };
}

function bannerText(texts: InvadersTexts, b: Banner): string {
  switch (b.kind) {
    case "wave":
      return texts.wave(b.n);
    case "points":
      return `+${b.n}`;
    case "missed":
      return texts.missed;
    case "shots":
      return texts.shots(b.n);
    case "rapid":
      return texts.rapid(b.n);
    case "power":
      return texts.powers[b.power];
  }
}

interface DrawCoop {
  /** Index of your ship. */
  you: number;
  coop: CoopTexts;
  /** Lines shown over a dimmed field (waiting, partner left…). */
  overlay: string[];
}

/** Draws one frame of a view; with `coop`, your ship is the accent and your partner's is white. */
function draw(
  shell: Shell,
  f: Fit,
  v: InvadersView,
  texts: InvadersTexts,
  now: number,
  coop?: DrawCoop,
) {
  const { g } = shell;
  const px = (bits: boolean[][], x: number, y: number) => {
    for (let r = 0; r < bits.length; r++)
      for (let c = 0; c < bits[r].length; c++)
        if (bits[r][c]) g.fillRect(x + c, y + r, 1, 1);
  };
  const text = (
    str: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = "left",
  ) => {
    g.font = `${size}px "Geist Mono Variable", ui-monospace, monospace`;
    g.textAlign = align;
    g.fillText(str, x, y);
  };

  g.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = devicePixelRatio || 1;
  g.fillStyle = "#000";
  g.fillRect(0, 0, shell.canvas.width, shell.canvas.height);
  g.setTransform(dpr * f.scale, 0, 0, dpr * f.scale, dpr * f.ox, dpr * f.oy);
  g.fillStyle = shell.accent;

  // HUD: score and best on the left, lives and the miss streak on the right, upgrades in the middle.
  text(`${texts.score} ${String(v.score).padStart(5, "0")}`, 4, 10, 7);
  text(`${texts.best} ${String(v.best).padStart(5, "0")}`, 4, 19, 6);
  text("♥".repeat(Math.max(0, v.lives)), W - 4, 10, 8, "right");
  g.globalAlpha = 0.6;
  text("×".repeat(v.misses), W - 4, 19, 7, "right");
  const upgrades = [
    v.shotCount > 1 && `×${v.shotCount}`,
    v.rapidLevel > 0 && `R${v.rapidLevel}`,
    v.pierceLeft > 0 && `P ${Math.ceil(v.pierceLeft / 1000)}s`,
    v.shieldLeft > 0 && `I ${Math.ceil(v.shieldLeft / 1000)}s`,
  ].filter(Boolean);
  text(upgrades.join("  "), W / 2, 10, 7, "center");
  g.globalAlpha = 1;
  g.fillRect(0, H - 6, W, 1);

  const flashing = new Set(v.flash);
  v.hp.forEach((hp, k) => {
    if (!hp) return;
    const b = slotBox(v, k);
    // Just hit but still standing: a short white flash. Hits left beyond one: dots under it.
    g.globalAlpha = 1 - Math.floor(k / 8) * 0.1;
    g.fillStyle = flashing.has(k) ? "#fff" : shell.accent;
    px(INVADER[v.animFrame], b.x, b.y);
    g.fillStyle = shell.accent;
    for (let d = 1; d < hp && d < 6; d++)
      g.fillRect(b.x + d * 2 - 1, b.y + 9.5, 1, 1);
  });
  g.globalAlpha = 1;

  v.ships.forEach((ship, i) => {
    const color = coop && i !== coop.you ? "#fff" : shell.accent;
    g.fillStyle = color;
    if (!ship.blink) px(SHIP, Math.round(ship.x - 6), SHIP_Y - 4);
    if (coop) {
      g.globalAlpha = 0.7;
      text(
        i === coop.you ? coop.coop.you : coop.coop.partner,
        ship.x,
        SHIP_Y + 13,
        5,
        "center",
      );
      g.globalAlpha = 1;
    }
    if (v.shieldLeft > 0) {
      // Invincible: a blinking outline around each ship, faster in its last two seconds.
      g.globalAlpha =
        Math.floor(now / (v.shieldLeft < 2000 ? 90 : 220)) % 2 ? 0.9 : 0.4;
      g.strokeStyle = color;
      g.lineWidth = 0.7;
      g.strokeRect(Math.round(ship.x - 9), SHIP_Y - 7, 18, 13);
      g.globalAlpha = 1;
    }
  });
  g.fillStyle = shell.accent;

  for (let i = 0; i < v.shots.length; i += 3)
    g.fillRect(v.shots[i], v.shots[i + 1], v.shots[i + 2] ? 2 : 1, 5);
  for (let i = 0; i < v.bombs.length; i += 2)
    g.fillRect(v.bombs[i], v.bombs[i + 1], 1, 4);
  if (v.flashLeft > 0) {
    g.globalAlpha = (v.flashLeft / 220) * 0.5;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, W, H);
    g.fillStyle = shell.accent;
    g.globalAlpha = 1;
  }
  g.globalAlpha = 0.75;
  SHIELDS.forEach(
    (c, k) =>
      v.shields[k] === "1" && g.fillRect(c.x, c.y, SHIELD_CELL, SHIELD_CELL),
  );
  g.globalAlpha = 1;
  if (v.ufoX !== null) {
    g.fillStyle = "#fff";
    px(UFO, Math.round(v.ufoX), UFO_Y);
    g.fillStyle = shell.accent;
  }
  for (const d of v.drops) {
    // A small capsule with the power-up's letter; it blinks so it reads as a pickup.
    g.globalAlpha = Math.floor(now / 180) % 2 ? 1 : 0.55;
    g.strokeStyle = shell.accent;
    g.lineWidth = 0.6;
    g.strokeRect(d.x - 4, d.y - 4, 8, 8);
    text(POWER_LETTER[d.kind], d.x, d.y + 2.5, 6, "center");
    g.globalAlpha = 1;
  }

  if (v.banner && !v.over)
    text(bannerText(texts, v.banner), W / 2, H / 2, 9, "center");
  if (v.over) {
    text(texts.over, W / 2, H / 2 - 10, 14, "center");
    text(`${texts.score} ${v.score}`, W / 2, H / 2 + 4, 8, "center");
    text(texts.restart, W / 2, H / 2 + 18, 7, "center");
  }
  if (coop?.overlay.length) {
    // Co-op messages over a dimmed band across the field.
    g.globalAlpha = 0.8;
    g.fillStyle = "#000";
    g.fillRect(0, H / 2 - 28, W, 50);
    g.globalAlpha = 1;
    g.fillStyle = shell.accent;
    coop.overlay.forEach((line, i) =>
      text(line, W / 2, H / 2 - 10 + i * 13, i === 0 ? 9 : 6.5, "center"),
    );
  }
}

/** Solo: the simulation runs here. `onExit` gets the best score of the session. */
export function playInvaders(
  texts: InvadersTexts,
  onExit: (best: number) => void,
) {
  const st = createInvaders(1);
  const pad = controls();
  const { f, update } = fit();
  const shell = openGame({
    texts,
    onResize: update,
    onKey: pad.key,
    onTouch(x, _y, phase) {
      pad.touch(phase === "end" ? null : (x - f.ox) / f.scale);
    },
    onExit: () => onExit(Math.max(st.best, st.score)),
  });
  // The first wave starts when the tutorial is dismissed, with its banner.
  let begun = false;

  shell.loop((now, dt) => {
    if (shell.started && !begun) {
      begun = true;
      restartInvaders(st, now);
    }
    // Fixed small steps: a long frame (a slow device, a throttled tab) must not let a shot jump over
    // an 8 px invader.
    if (shell.started && !shell.paused)
      for (let left = dt; left > 0; left -= 16)
        stepInvaders(
          st,
          [pad.input()],
          now - Math.max(0, left - 16),
          Math.min(16, left),
        );
    draw(shell, f, viewInvaders(st, now), texts, now);
  });
}

/**
 * Co-op: two ships, simulated on the server. `room` joins an existing room (from a shared link);
 * without it a new room is created and `onRoom` gets its code to share.
 */
export function playInvadersCoop(
  texts: InvadersTexts,
  coop: CoopTexts,
  {
    room,
    onRoom,
    onExit,
  }: {
    room?: string;
    onRoom: (code: string) => void;
    onExit: (best: number, note?: string) => void;
  },
) {
  const pad = controls();
  const { f, update } = fit();
  // Before the first snapshot arrives, an empty two-ship field is drawn behind the waiting message.
  const placeholder = viewInvaders(createInvaders(2), 0);
  let view: InvadersView | null = null;
  let you = 0;
  let note: string | undefined;
  let overlay: string[] = [coop.waiting];
  let best = 0;
  let sent = "";

  const net = connect({
    open: () =>
      net.send(room ? { t: "coop.join", room } : { t: "coop.create" }),
    message(msg) {
      if (msg.t === "coop.room") {
        you = msg.you;
        if (!room) onRoom(msg.room);
        overlay =
          msg.players < 2
            ? [coop.waiting, coop.share.replace("{code}", msg.room)]
            : [];
      } else if (msg.t === "coop.start") overlay = [];
      else if (msg.t === "coop.state") {
        view = msg.view;
        best = Math.max(best, msg.view.best);
      } else if (msg.t === "coop.left") {
        note = coop.partnerLeft;
        overlay = [note];
      } else if (msg.t === "coop.error") {
        note = msg.reason === "full" ? coop.full : coop.notFound;
        overlay = [note];
      }
    },
    close() {
      note ??= coop.disconnected;
      overlay = [note];
    },
  });

  const shell = openGame({
    texts,
    live: true,
    onResize: update,
    onKey: pad.key,
    onTouch(x, _y, phase) {
      pad.touch(phase === "end" ? null : (x - f.ox) / f.scale);
    },
    onStart: () => net.send({ t: "coop.ready" }),
    onExit() {
      net.close();
      onExit(best, note);
    },
  });

  shell.loop((now) => {
    // Only changes go over the wire; the pause panel or a hidden tab sends "nothing pressed".
    const input = shell.started && !shell.paused ? pad.input() : idleInput();
    const key = JSON.stringify(input);
    if (key !== sent) {
      sent = key;
      net.send({ t: "coop.input", input });
    }
    draw(shell, f, view ?? placeholder, texts, now, { you, coop, overlay });
  });
}
