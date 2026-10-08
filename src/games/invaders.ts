// Space Invaders on screen: the arcade's 224×256 field scaled to fit on black. The rules live in
// invaders-sim.ts; here are the controls and the drawing.
// ← → or A D move, Space (or ↑ / W) fires; on touch the ship follows the finger and fires while held.
//
// Solo runs the simulation in the browser. Co-op runs it on the server, which is a long way off (about
// 160 ms there and back from Brazil), so this side hides the wait: your ship moves here at once and the
// server follows it, your shots appear the moment you fire, and everything else is drawn where it is now,
// projected from the last snapshot by its speed, instead of where it was when the snapshot left.
import { unlock } from "../achievements.ts";
import {
  BOMB_STRIDE,
  createInvaders,
  DROP_SPEED,
  fireCooldownMs,
  H,
  moveShip,
  SHOT_START_Y,
  SHOT_STRIDE,
  shotSpeed,
  idleInput,
  restartInvaders,
  SHIELD_CELL,
  shieldLayout,
  SHIP_Y,
  slotBox,
  SPECIAL_HOLD_MS,
  SPECIAL_SPEED,
  stepInvaders,
  UFO_SPEED,
  UFO_Y,
  viewInvaders,
  W,
  type Banner,
  type InvadersView,
  type PowerKind,
  type ShipInput,
} from "./invaders-sim.ts";
import { connect, pingLabel } from "./net.ts";
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
  /** Shown while the special is charged: how to fire it. */
  special: string;
}

/** Extra lines for co-op: the waiting screen, the ship labels and what can go wrong with the connection. */
export interface CoopTexts {
  waiting: string;
  /** "{code}" is replaced with the room code. */
  share: string;
  partnerLeft: string;
  /** Your partner's connection dropped and the game waits for them. */
  partnerAway: string;
  reconnecting: string;
  disconnected: string;
  unreachable: string;
  full: string;
  notFound: string;
  you: string;
  partner: string;
}

export const POWER_LETTER: Record<PowerKind, string> = {
  multi: "+",
  rapid: "R",
  pierce: "P",
  shield: "I",
  heart: "♥",
  nuke: "B",
};

const sprite = (rows: string[]) =>
  rows.map((r) => [...r].map((c) => c === "#"));
export const INVADER = [
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
export const SHIP = sprite([
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
export function controls() {
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

export function bannerText(texts: InvadersTexts, b: Banner): string {
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

/**
 * The special's charge, centred at (x, y): five pips filling with each volley that hits, then a blinking
 * star with how to fire it.
 */
export function drawSpecial(
  g: CanvasRenderingContext2D,
  texts: InvadersTexts,
  ship: { streak: number; special: boolean },
  x: number,
  y: number,
  now: number,
) {
  if (ship.special) {
    g.globalAlpha = Math.floor(now / 260) % 2 ? 1 : 0.6;
    g.font = `6px "Geist Mono Variable", ui-monospace, monospace`;
    g.textAlign = "center";
    g.fillText(`★ ${texts.special}`, x, y + 2);
    g.globalAlpha = 1;
    return;
  }
  for (let k = 0; k < 5; k++) {
    g.globalAlpha = k < ship.streak ? 0.9 : 0.25;
    g.fillRect(x - 12 + k * 5, y - 1.5, 3, 3);
  }
  g.globalAlpha = 1;
}

/**
 * A shot, from a flat shots entry: plain (1 px), piercing (2 px) or the special (white, wider, with a
 * fading trail behind it).
 */
export function drawShot(
  g: CanvasRenderingContext2D,
  accent: string,
  x: number,
  y: number,
  kind: number,
  vy: number,
) {
  // `y` is the tip; the body (and the special's trail) runs back from it, against the way it flies.
  const back = vy > 0 ? -1 : 1;
  if (kind !== 2) {
    g.fillRect(x, back > 0 ? y : y - 5, kind ? 2 : 1, 5);
    return;
  }
  g.fillStyle = "#fff";
  g.fillRect(x - 1, back > 0 ? y : y - 7, 3, 7);
  g.fillStyle = accent;
  for (let k = 1; k <= 4; k++) {
    g.globalAlpha = 0.5 - k * 0.1;
    g.fillRect(x - 0.5, back > 0 ? y + 2 + k * 5 : y - 7 - k * 5, 2, 5);
  }
  g.globalAlpha = 1;
}

interface DrawCoop {
  /** Index of your ship. */
  you: number;
  coop: CoopTexts;
  /** Lines shown over a dimmed field (waiting, partner left…). */
  overlay: string[];
  /** Round trip to the server in ms, shown small in a corner; 0 until measured. */
  rtt: number;
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
  const mine = v.ships[coop?.you ?? 0];
  if (mine) drawSpecial(g, texts, mine, W / 2, 18, now);
  g.fillRect(0, H - 6, W, 1);
  if (coop?.rtt) {
    // The round trip, under the ground line: grey when fine, yellow when slow, red when bad.
    const ping = pingLabel(coop.rtt);
    g.fillStyle = ping.color;
    text(ping.text, W - 2, H - 0.5, 5, "right");
    g.fillStyle = shell.accent;
  }

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

  for (let i = 0; i < v.shots.length; i += SHOT_STRIDE)
    drawShot(
      g,
      shell.accent,
      v.shots[i],
      v.shots[i + 1],
      v.shots[i + 2],
      v.shots[i + 4],
    );
  for (let i = 0; i < v.bombs.length; i += BOMB_STRIDE)
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

/** Solo: the simulation runs here. `onExit` gets the best score of the session, `onRound` each game's score. */
export function playInvaders(
  texts: InvadersTexts,
  onExit: (best: number) => void,
  onRound?: (score: number) => void,
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
  let wasOver = false;

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
    if (st.wave >= 3) unlock("defender");
    if (st.shots.some((s) => s.special)) unlock("special");
    if (st.over && !wasOver) onRound?.(st.score);
    wasOver = st.over;
    draw(shell, f, viewInvaders(st, now), texts, now);
  });
}

/**
 * A shot fired here, drawn from the moment you press. The server fires it a little later (when the press
 * arrives), so its copy trails behind: that copy only confirms the shot, and the one drawn stays this one,
 * until the server's is gone (it hit something) or this one reaches an invader.
 */
type Ghost = {
  x: number;
  vx: number;
  vy: number;
  at: number;
  /** When the server's copy was last seen; 0 until it first shows up. */
  seen: number;
  /** The special: fast, and drills through what it hits. */
  special?: boolean;
};

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
  /** When the last snapshot arrived (performance.now()). */
  let viewAt = 0;
  let you = 0;
  /** The room and this seat's token, to take the seat back after a dropped connection. */
  let code = room;
  let token: string | undefined;
  let note: string | undefined;
  let overlay: string[] = [coop.waiting];
  let best = 0;
  /** Your ship, moved here as you press; the server follows it. Null until a snapshot places it. */
  let myX: number | null = null;
  /** How fast your ship is moving: a start or a stop is reported at once. */
  let myVx = 0;
  /** Your partner's ship, eased towards each snapshot so it glides instead of stepping 30 times a second. */
  let partnerX: number | null = null;
  let ghosts: Ghost[] = [];
  let lastVolley = -Infinity;
  /** When fire was pressed here (for the special's hold); Infinity once this hold fired it. */
  let heldSince: number | null = null;
  let sent = "";
  let sentFire = false;
  let sentAt = 0;

  const net = connect({
    open: () =>
      net.send(
        code
          ? { t: "coop.join", room: code, resume: token }
          : { t: "coop.create" },
      ),
    message(msg) {
      if (msg.t === "coop.room") {
        you = msg.you;
        token = msg.token;
        if (!code) onRoom(msg.room);
        code = msg.room;
        overlay =
          msg.players < 2
            ? [coop.waiting, coop.share.replace("{code}", msg.room)]
            : [];
      } else if (msg.t === "coop.start") overlay = [];
      else if (msg.t === "coop.state") {
        view = msg.view;
        viewAt = performance.now();
        best = Math.max(best, msg.view.best);
        myX ??= msg.view.ships[you]?.x ?? null;
        if (msg.view.wave >= 3) unlock("defender");
        if (msg.view.over) ghosts = [];
      } else if (msg.t === "coop.away") overlay = [coop.partnerAway];
      else if (msg.t === "coop.back") overlay = [];
      else if (msg.t === "coop.left") {
        note = coop.partnerLeft;
        overlay = [note];
      } else if (msg.t === "coop.error") {
        note = msg.reason === "full" ? coop.full : coop.notFound;
        overlay = [note];
      }
    },
    reconnecting() {
      overlay = [coop.reconnecting];
    },
    close(opened) {
      note ??= opened ? coop.disconnected : coop.unreachable;
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

  /** The last snapshot, moved forward to the present and with your ship and shots as they are here. */
  function present(v: InvadersView, t: number): InvadersView {
    // The snapshot left the server half a round trip ago, plus however long it has been here. While the
    // game waits (a message over the field: someone reconnecting, waiting for the partner), nothing moves.
    const lead = overlay.length
      ? 0
      : Math.min(0.3, (net.rtt() / 2 + (t - viewAt)) / 1000);
    const shots: number[] = [];
    const claimed = new Set<number>();
    for (let i = 0; i < v.shots.length; i += SHOT_STRIDE) {
      const [x, y, pierce, vx, vy, ship] = v.shots.slice(i, i + SHOT_STRIDE);
      const px = x + vx * lead;
      const py = y + vy * lead;
      if (py < -6) continue;
      // Your server shot confirms the ghost just ahead of it on the same line, and is not drawn itself
      // (a faster shot trails further behind its ghost).
      if (ship === you) {
        const gh = ghosts.find(
          (g, k) =>
            !claimed.has(k) &&
            !!g.special === (pierce === 2) &&
            Math.abs(g.x + g.vx * age(g, t) - px) < 6 &&
            py - ghostY(g, t) > -10 &&
            py - ghostY(g, t) < (45 * Math.abs(g.vy)) / 260,
        );
        if (gh) {
          claimed.add(ghosts.indexOf(gh));
          gh.seen = t;
          continue;
        }
      }
      shots.push(px, py, pierce, vx, vy, ship);
    }
    for (const gh of ghosts)
      shots.push(
        gh.x + gh.vx * age(gh, t),
        ghostY(gh, t),
        gh.special ? 2 : v.pierceLeft > 0 ? 1 : 0,
        gh.vx,
        gh.vy,
        you,
      );
    const bombs: number[] = [];
    for (let i = 0; i < v.bombs.length; i += BOMB_STRIDE)
      bombs.push(
        v.bombs[i],
        v.bombs[i + 1] + v.bombs[i + 2] * lead,
        v.bombs[i + 2],
      );
    return {
      ...v,
      ships: v.ships.map((ship, i) => ({
        ...ship,
        x: i === you ? (myX ?? ship.x) : (partnerX ?? ship.x),
      })),
      shots,
      bombs,
      drops: v.drops.map((d) => ({ ...d, y: d.y + DROP_SPEED * lead })),
      ufoX: v.ufoX === null ? null : v.ufoX + v.ufoDir * UFO_SPEED * lead,
    };
  }

  const age = (gh: Ghost, t: number) => (t - gh.at) / 1000;
  const ghostY = (gh: Ghost, t: number) => SHOT_START_Y + gh.vy * age(gh, t);

  shell.loop((now, dt) => {
    const t = performance.now();
    const active = shell.started && !shell.paused;
    const input = active ? pad.input() : idleInput();
    const fire = input.fire || input.touchX !== null;
    const v = view;

    const before = myX;
    if (v && myX !== null && active && !v.over) myX = moveShip(myX, input, dt);
    myVx =
      before !== null && myX !== null && dt > 0
        ? ((myX - before) * 1000) / dt
        : 0;
    const partner = v?.ships[1 - you];
    if (partner)
      partnerX =
        partnerX === null
          ? partner.x
          : partnerX + (partner.x - partnerX) * Math.min(1, dt / 50);

    // Fire: the volley shows at once, under the same pacing the server uses (cooldown, volleys on screen).
    if (v && myX !== null && active && fire && !v.over) {
      const myShots = v.shots.filter(
        (_, i) => i % SHOT_STRIDE === 5 && v.shots[i] === you,
      ).length;
      const volleys =
        Math.ceil(myShots / v.shotCount) +
        new Set(ghosts.filter((gh) => !gh.special).map((gh) => gh.at)).size;
      if (
        t - lastVolley >= fireCooldownMs(v.rapidLevel) &&
        volleys < 1 + Math.ceil(v.rapidLevel / 2)
      ) {
        lastVolley = t;
        for (let i = 0; i < v.shotCount; i++) {
          const k = i - (v.shotCount - 1) / 2;
          ghosts.push({
            x: myX + k * 3,
            vx: k * 34,
            vy: -shotSpeed(v.rapidLevel),
            at: t,
            seen: 0,
          });
        }
      }
    }
    // The special: charged (says the server) and fire held long enough here, once per hold.
    if (!(active && fire)) heldSince = null;
    else if (v && myX !== null && !v.over) {
      heldSince ??= t;
      if (v.ships[you]?.special && t - heldSince >= SPECIAL_HOLD_MS) {
        heldSince = Infinity;
        unlock("special");
        ghosts.push({
          x: myX,
          vx: 0,
          vy: -SPECIAL_SPEED,
          at: t,
          seen: 0,
          special: true,
        });
      }
    }
    // A ghost goes when its server copy is gone (the shot hit something), when it reaches an invader (unless
    // piercing), or, never confirmed, after a round trip and a bit (the server did not fire it).
    if (v)
      ghosts = ghosts.filter((gh) => {
        const y = ghostY(gh, t);
        const x = gh.x + gh.vx * age(gh, t);
        const hitInvader =
          v.pierceLeft <= 0 &&
          !gh.special &&
          v.hp.some((hp, k) => {
            if (!hp) return false;
            const b = slotBox(v, k);
            return x >= b.x && x <= b.x + 11 && y >= b.y && y <= b.y + 8;
          });
        const alive = gh.seen ? t - gh.seen < 90 : t - gh.at < net.rtt() + 250;
        return y > -6 && !hitInvader && alive;
      });

    // Report the ship's place up to 30 times a second; a fire press or release goes at once.
    if (myX !== null) {
      const firing = active && fire;
      const key = `${Math.round(myX * 10)}|${firing}|${Math.sign(Math.round(myVx))}`;
      if (key !== sent && (firing !== sentFire || t - sentAt >= 33)) {
        sent = key;
        sentFire = firing;
        sentAt = t;
        net.send({
          t: "coop.input",
          input: {
            x: Math.round(myX * 10) / 10,
            vx: Math.round(myVx),
            fire: firing,
            rtt: Math.round(net.rtt()),
          },
        });
      }
    }

    draw(shell, f, v ? present(v, t) : placeholder, texts, now, {
      you,
      coop,
      overlay,
      rtt: net.rtt(),
    });
  });
}
