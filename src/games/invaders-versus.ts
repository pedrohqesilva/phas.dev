// Space Invaders versus on screen: the match runs on the server (invaders-versus-sim.ts); here are the
// controls and the drawing. Each player sees their own ship at the bottom: for the top seat the field is
// flipped upside down. As in co-op, your ship moves here at once and the server follows it, your shots
// show the moment you fire, and everything else is drawn where it is now, played forward from the last
// snapshot by its speed.
import { unlock } from "../achievements.ts";
import {
  bannerText,
  controls,
  drawShot,
  drawSpecial,
  INVADER,
  POWER_LETTER,
  SHIP,
  type InvadersTexts,
} from "./invaders.ts";
import {
  fireCooldownMs,
  idleInput,
  moveShip,
  SHIELD_CELL,
  shotSpeed,
  SPECIAL_HOLD_MS,
  SPECIAL_SPEED,
} from "./invaders-sim.ts";
import {
  shieldCells,
  SHIP_YS,
  SHOT_DIR,
  versusSlotBox,
  VH,
  W,
  type VersusView,
} from "./invaders-versus-sim.ts";
import { connect, pingLabel, remoteTrack, serverClock } from "./net.ts";
import type { VersusTexts } from "./pong.ts";
import { openGame } from "./shell.ts";

export interface DuelTexts extends InvadersTexts {
  you: string;
  rival: string;
  win: string;
  lose: string;
  again: string;
  waitingAgain: string;
}

const SHIELDS = shieldCells();
const STRIDE = 6;

type Fit = { scale: number; ox: number; oy: number };

/** A shot fired here, drawn from the press until the server's copy is gone (see invaders.ts, co-op). */
type Ghost = {
  x: number;
  vx: number;
  vy: number;
  at: number;
  seen: number;
  special?: boolean;
};

export function playInvadersVersus(
  texts: DuelTexts,
  versus: VersusTexts,
  {
    room,
    onRoom,
    onExit,
  }: {
    room?: string;
    onRoom: (code: string) => void;
    onExit: (note?: string) => void;
  },
) {
  const pad = controls();
  const f: Fit = { scale: 1, ox: 0, oy: 0 };
  const update = () => {
    f.scale = Math.min(innerWidth / W, innerHeight / VH) * 0.96;
    f.ox = (innerWidth - W * f.scale) / 2;
    f.oy = (innerHeight - VH * f.scale) / 2;
  };
  update();

  let code = room;
  let token: string | undefined;
  let you: 0 | 1 = 0;
  let view: VersusView | null = null;
  let viewAt = 0;
  let note: string | undefined;
  let overlay: string[] = [versus.waiting];
  let myX: number | null = null;
  let myVx = 0;
  let rivalX: number | null = null;
  let ghosts: Ghost[] = [];
  let lastVolley = -Infinity;
  let heldSince: number | null = null;
  let sent = "";
  let sentFire = false;
  let sentAt = 0;
  let firePrev = false;
  let askedAgain = false;

  const clock = serverClock();
  const rivalTrack = remoteTrack();
  const net = connect({
    open: () =>
      net.send(
        code
          ? { t: "invaders.join", room: code, resume: token }
          : { t: "invaders.create" },
      ),
    message(msg) {
      if (msg.t === "invaders.room") {
        you = msg.you === 1 ? 1 : 0;
        token = msg.token;
        if (!code) onRoom(msg.room);
        code = msg.room;
        overlay =
          msg.players < 2
            ? [
                versus.waiting,
                versus.share.replace("{link}", `phas.dev/invaders/${msg.room}`),
              ]
            : [];
      } else if (msg.t === "invaders.start") {
        overlay = [];
        askedAgain = false;
        ghosts = [];
        myX = null;
      } else if (msg.t === "invaders.state") {
        view = msg.view;
        viewAt = performance.now();
        clock.sample(msg.view.at, net.rtt() / 2, viewAt);
        rivalTrack.push(msg.view.at, msg.view.players[you === 0 ? 1 : 0].x);
        myX ??= msg.view.players[you].x;
        if (msg.view.winner !== null) ghosts = [];
        if (msg.view.winner === you) unlock("champion");
      } else if (msg.t === "invaders.away") overlay = [versus.partnerAway];
      else if (msg.t === "invaders.back") overlay = [];
      else if (msg.t === "invaders.left")
        overlay = [(note = versus.partnerLeft)];
      else if (msg.t === "invaders.error")
        overlay = [
          (note = msg.reason === "full" ? versus.full : versus.notFound),
        ];
    },
    reconnecting: () => (overlay = [versus.reconnecting]),
    close(opened) {
      note ??= opened ? versus.disconnected : versus.unreachable;
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
    onStart: () => net.send({ t: "invaders.ready" }),
    onExit() {
      net.close();
      onExit(note);
    },
  });

  const age = (gh: Ghost, t: number) => (t - gh.at) / 1000;
  const ghostY = (gh: Ghost, t: number) =>
    SHIP_YS[you] + SHOT_DIR[you] * 6 + gh.vy * age(gh, t);

  /** The last snapshot moved to the present, with your ship and shots as they are here. */
  function present(v: VersusView, t: number): VersusView {
    const lead = overlay.length
      ? 0
      : Math.max(0, Math.min(0.3, (clock.now(t) - v.at) / 1000));
    const shots: number[] = [];
    const claimed = new Set<number>();
    for (let i = 0; i < v.shots.length; i += STRIDE) {
      const [x, y, kind, vx, vy, ship] = v.shots.slice(i, i + STRIDE);
      const px = x + vx * lead;
      const py = y + vy * lead;
      if (ship === you) {
        // Your server shot confirms the ghost just ahead of it on its line, and is not drawn itself.
        const gh = ghosts.find((g, k) => {
          const along = (ghostY(g, t) - py) * SHOT_DIR[you];
          return (
            !claimed.has(k) &&
            !!g.special === (kind === 2) &&
            Math.abs(g.x + g.vx * age(g, t) - px) < 6 &&
            along > -10 &&
            along < (45 * Math.abs(g.vy)) / 260
          );
        });
        if (gh) {
          claimed.add(ghosts.indexOf(gh));
          gh.seen = t;
          continue;
        }
      }
      shots.push(px, py, kind, vx, vy, ship);
    }
    const me = v.players[you];
    for (const gh of ghosts)
      shots.push(
        gh.x + gh.vx * age(gh, t),
        ghostY(gh, t),
        gh.special ? 2 : me.pierceLeft > 0 ? 1 : 0,
        gh.vx,
        gh.vy,
        you,
      );
    const bombs: number[] = [];
    for (let i = 0; i < v.bombs.length; i += 3)
      bombs.push(
        v.bombs[i],
        v.bombs[i + 1] + v.bombs[i + 2] * lead,
        v.bombs[i + 2],
      );
    return {
      ...v,
      players: v.players.map((p, i) => ({
        ...p,
        x: i === you ? (myX ?? p.x) : (rivalX ?? p.x),
      })),
      shots,
      bombs,
      drops: v.drops.map((d) => ({
        ...d,
        y: d.y + (d.to === 0 ? 1 : -1) * 45 * lead,
      })),
    };
  }

  function draw(v: VersusView | null, now: number) {
    const g = shell.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = devicePixelRatio || 1;
    g.fillStyle = "#000";
    g.fillRect(0, 0, shell.canvas.width, shell.canvas.height);
    g.setTransform(dpr * f.scale, 0, 0, dpr * f.scale, dpr * f.ox, dpr * f.oy);
    const accent = shell.accent;
    g.fillStyle = accent;
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
    /** Field y as drawn: flipped for the top seat, so your ship is always at the bottom. */
    const fy = (y: number) => (you === 0 ? y : VH - y);
    const px = (bits: boolean[][], x: number, y: number, flip = false) => {
      for (let r = 0; r < bits.length; r++)
        for (let c = 0; c < bits[r].length; c++)
          if (bits[flip ? bits.length - 1 - r : r][c])
            g.fillRect(x + c, y + r, 1, 1);
    };
    g.globalAlpha = 0.3;
    g.strokeStyle = accent;
    g.lineWidth = 0.5;
    g.strokeRect(0, 0, W, VH);
    g.globalAlpha = 1;
    if (!v) return;
    const other: 0 | 1 = you === 0 ? 1 : 0;
    const me = v.players[you];
    const rival = v.players[other];

    // HUDs: the rival's at the top (white), yours at the bottom.
    g.fillStyle = "#fff";
    g.globalAlpha = 0.75;
    text(`${texts.rival} ${String(rival.score).padStart(5, "0")}`, 4, 9, 6);
    text("♥".repeat(Math.max(0, rival.lives)), W - 4, 9, 7, "right");
    g.globalAlpha = 1;
    g.fillStyle = accent;
    text(`${texts.you} ${String(me.score).padStart(5, "0")}`, 4, VH - 4, 6);
    text("♥".repeat(Math.max(0, me.lives)), W - 4, VH - 4, 8, "right");
    const upgrades = [
      me.shotCount > 1 && `×${me.shotCount}`,
      me.rapidLevel > 0 && `R${me.rapidLevel}`,
      me.pierceLeft > 0 && `P ${Math.ceil(me.pierceLeft / 1000)}s`,
      me.shieldLeft > 0 && `I ${Math.ceil(me.shieldLeft / 1000)}s`,
    ].filter(Boolean);
    g.globalAlpha = 0.6;
    text(upgrades.join("  "), W / 2, VH - 4, 6, "center");
    g.globalAlpha = 1;
    drawSpecial(g, texts, me, W / 2, VH - 13, now);

    // Invaders, upright for both players.
    const flashing = new Set(v.flash);
    v.hp.forEach((hp, k) => {
      if (!hp) return;
      const b = versusSlotBox(v.gridX, k);
      g.fillStyle = flashing.has(k) ? "#fff" : accent;
      const top = you === 0 ? b.y : VH - b.y - b.h;
      px(INVADER[v.animFrame], b.x, top);
      g.fillStyle = accent;
      for (let d = 1; d < hp && d < 6; d++)
        g.fillRect(b.x + d * 2 - 1, top + 9.5, 1, 1);
    });

    // Ships: yours at the bottom in the accent, the rival's at the top, white and upside down.
    for (const side of [you, other] as const) {
      const p = v.players[side];
      const color = side === you ? accent : "#fff";
      g.fillStyle = color;
      const y = fy(SHIP_YS[side]);
      if (!p.blink) px(SHIP, Math.round(p.x - 6), y - 4, side !== you);
      if (p.shieldLeft > 0) {
        g.globalAlpha =
          Math.floor(now / (p.shieldLeft < 2000 ? 90 : 220)) % 2 ? 0.9 : 0.4;
        g.strokeStyle = color;
        g.lineWidth = 0.7;
        g.strokeRect(Math.round(p.x - 9), y - 7, 18, 13);
        g.globalAlpha = 1;
      }
    }
    g.fillStyle = accent;

    for (let i = 0; i < v.shots.length; i += STRIDE) {
      const mine = v.shots[i + 5] === you;
      g.fillStyle = mine ? accent : "#fff";
      drawShot(
        g,
        mine ? accent : "#fff",
        v.shots[i],
        fy(v.shots[i + 1]),
        v.shots[i + 2],
        you === 0 ? v.shots[i + 4] : -v.shots[i + 4],
      );
    }
    g.fillStyle = accent;
    for (let i = 0; i < v.bombs.length; i += 3)
      g.fillRect(v.bombs[i], fy(v.bombs[i + 1]) - 2, 1, 4);
    g.globalAlpha = 0.75;
    SHIELDS.forEach(
      (c, k) =>
        v.shields[k] === "1" &&
        g.fillRect(
          c.x,
          you === 0 ? c.y : VH - c.y - SHIELD_CELL,
          SHIELD_CELL,
          SHIELD_CELL,
        ),
    );
    g.globalAlpha = 1;
    for (const d of v.drops) {
      g.globalAlpha = Math.floor(now / 180) % 2 ? 1 : 0.55;
      g.strokeStyle = d.to === you ? accent : "#fff";
      g.fillStyle = d.to === you ? accent : "#fff";
      g.lineWidth = 0.6;
      g.strokeRect(d.x - 4, fy(d.y) - 4, 8, 8);
      text(POWER_LETTER[d.kind], d.x, fy(d.y) + 2.5, 6, "center");
    }
    g.globalAlpha = 1;
    g.fillStyle = accent;

    // Your messages (wave, power-ups) between the invaders and your shields.
    if (me.banner && v.winner === null)
      text(bannerText(texts, me.banner), W / 2, VH * 0.72, 8, "center");
    if (net.rtt()) {
      const ping = pingLabel(net.rtt());
      g.fillStyle = ping.color;
      text(ping.text, W - 2, VH - 13, 5, "right");
      g.fillStyle = accent;
    }
    const lines =
      overlay.length || v.winner === null
        ? overlay
        : [
            v.winner === you ? texts.win : texts.lose,
            askedAgain ? texts.waitingAgain : texts.again,
          ];
    if (lines.length) {
      g.globalAlpha = 0.85;
      g.fillStyle = "#000";
      g.fillRect(0, VH / 2 - 28, W, 50);
      g.globalAlpha = 1;
      g.fillStyle = accent;
      lines.forEach((l, i) =>
        text(l, W / 2, VH / 2 - 8 + i * 13, i === 0 ? 10 : 6.5, "center"),
      );
    }
  }

  shell.loop((now, dt) => {
    const t = performance.now();
    const v = view;
    const playing = !!v && v.winner === null && !overlay.length;
    const active = shell.started && !shell.paused;
    const input = active ? pad.input() : idleInput();
    const fire = input.fire || input.touchX !== null;

    const before = myX;
    if (playing && myX !== null && active) myX = moveShip(myX, input, dt);
    myVx =
      before !== null && myX !== null && dt > 0
        ? ((myX - before) * 1000) / dt
        : 0;
    // The rival's ship, a few snapshots back, at an even pace.
    rivalX = rivalTrack.at(clock.now(t) - net.rtt() / 2);

    if (v && playing && myX !== null && active && fire) {
      // The volley shows at once, under the server's pacing (cooldown, volleys on screen).
      const me = v.players[you];
      let mine = 0;
      for (let i = 0; i < v.shots.length; i += STRIDE)
        if (v.shots[i + 5] === you && v.shots[i + 2] !== 2) mine++;
      const volleys =
        Math.ceil(mine / me.shotCount) +
        new Set(ghosts.filter((gh) => !gh.special).map((gh) => gh.at)).size;
      if (
        t - lastVolley >= fireCooldownMs(me.rapidLevel) &&
        volleys < 1 + Math.ceil(me.rapidLevel / 2)
      ) {
        lastVolley = t;
        for (let i = 0; i < me.shotCount; i++) {
          const k = i - (me.shotCount - 1) / 2;
          ghosts.push({
            x: myX + k * 3,
            vx: k * 34,
            vy: SHOT_DIR[you] * shotSpeed(me.rapidLevel),
            at: t,
            seen: 0,
          });
        }
      }
    }
    // The special: charged (says the server) and fire held long enough here, once per hold.
    if (!(active && fire)) heldSince = null;
    else if (v && playing && myX !== null) {
      heldSince ??= t;
      if (v.players[you].special && t - heldSince >= SPECIAL_HOLD_MS) {
        heldSince = Infinity;
        unlock("special");
        ghosts.push({
          x: myX,
          vx: 0,
          vy: SHOT_DIR[you] * SPECIAL_SPEED,
          at: t,
          seen: 0,
          special: true,
        });
      }
    }
    if (v)
      ghosts = ghosts.filter((gh) => {
        const y = ghostY(gh, t);
        const x = gh.x + gh.vx * age(gh, t);
        const hitInvader =
          !gh.special &&
          v.players[you].pierceLeft <= 0 &&
          v.hp.some((hp, k) => {
            if (!hp) return false;
            const b = versusSlotBox(v.gridX, k);
            return x >= b.x && x <= b.x + 11 && y >= b.y && y <= b.y + 8;
          });
        const alive = gh.seen ? t - gh.seen < 90 : t - gh.at < net.rtt() + 250;
        return y > -6 && y < VH + 6 && !hitInvader && alive;
      });

    // Report the ship: up to 30 times a second, at once on a fire press or release, a start or a stop.
    if (myX !== null) {
      const firing = active && fire && playing;
      const key = `${Math.round(myX * 10)}|${firing}|${Math.sign(Math.round(myVx))}`;
      if (key !== sent && (firing !== sentFire || t - sentAt >= 33)) {
        sent = key;
        sentFire = firing;
        sentAt = t;
        net.send({
          t: "invaders.input",
          input: {
            x: Math.round(myX * 10) / 10,
            vx: Math.round(myVx),
            fire: firing,
            rtt: Math.round(net.rtt()),
          },
        });
      }
    }
    // After a win, a fresh press asks for another match.
    if (v && v.winner !== null && fire && !firePrev && !askedAgain && active) {
      askedAgain = true;
      net.send({ t: "invaders.again" });
    }
    firePrev = fire;

    draw(v ? present(v, t) : null, now);
  });
}
