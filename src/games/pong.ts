// Pong on screen: against the computer (all here) or 1v1 online (the match runs on the server). Up/down
// arrows or W S move your paddle; on touch it follows your finger. First to 7.
//
// Online, you are always drawn on the left. Your paddle moves here at once and the server follows it; the
// ball is drawn where it is now, played forward from the last snapshot with the same physics (bouncing
// off the walls and the paddles as they are on your screen), and the other paddle glides between snapshots.
import { unlock } from "../achievements.ts";
import { connect, pingLabel, remoteTrack, serverClock } from "./net.ts";
import {
  BALL,
  clampPaddle,
  cpuPaddle,
  createPong,
  H,
  movePaddle,
  PADDLE_H,
  PADDLE_W,
  PADDLE_X,
  stepBall,
  W,
  WIN,
  type PongState,
  type PongView,
} from "./pong-sim.ts";
import { openGame, type GameTexts } from "./shell.ts";

export interface PongTexts extends GameTexts {
  you: string;
  rival: string;
  cpu: string;
  win: string;
  lose: string;
  again: string;
  waitingAgain: string;
}

/** What the online mode needs to say about the room and the connection. */
export interface VersusTexts {
  waiting: string;
  /** In the lobby, waiting for whoever looks for a match next. */
  searching: string;
  /** "{link}" is replaced with the invite link. */
  share: string;
  partnerAway: string;
  partnerLeft: string;
  reconnecting: string;
  disconnected: string;
  unreachable: string;
  full: string;
  notFound: string;
}

type Fit = { scale: number; ox: number; oy: number };

function fit(): { f: Fit; update: () => void } {
  const f: Fit = { scale: 1, ox: 0, oy: 0 };
  const update = () => {
    f.scale = Math.min(innerWidth / W, (innerHeight - 40) / H) * 0.94;
    f.ox = (innerWidth - W * f.scale) / 2;
    f.oy = (innerHeight - H * f.scale) / 2 + 10;
  };
  update();
  return { f, update };
}

interface Scene {
  ball: [number, number] | null;
  /** Paddle centres, left then right, as drawn. */
  paddles: [number, number];
  score: [number, number];
  labels: [string, string];
  lines: string[];
  rtt: number;
}

function draw(
  shellG: CanvasRenderingContext2D,
  accent: string,
  f: Fit,
  s: Scene,
  w: number,
  h: number,
) {
  const g = shellG;
  g.setTransform(1, 0, 0, 1, 0, 0);
  const dpr = devicePixelRatio || 1;
  g.fillStyle = "#000";
  g.fillRect(0, 0, w * dpr, h * dpr);
  g.setTransform(dpr * f.scale, 0, 0, dpr * f.scale, dpr * f.ox, dpr * f.oy);
  const text = (
    str: string,
    x: number,
    y: number,
    size: number,
    align: CanvasTextAlign = "center",
  ) => {
    g.font = `${size}px "Geist Mono Variable", ui-monospace, monospace`;
    g.textAlign = align;
    g.fillText(str, x, y);
  };
  g.strokeStyle = accent;
  g.globalAlpha = 0.35;
  g.lineWidth = 0.6;
  g.strokeRect(0, 0, W, H);
  // The net, dashed down the middle.
  for (let y = 4; y < H; y += 10) g.fillRect(W / 2 - 0.5, y, 1, 5);
  g.globalAlpha = 1;
  g.fillStyle = accent;
  // Scores big at the top, labels under them.
  text(String(s.score[0]), W / 2 - 30, 26, 22);
  text(String(s.score[1]), W / 2 + 30, 26, 22);
  g.globalAlpha = 0.6;
  text(s.labels[0], W / 4, 14, 7);
  text(s.labels[1], (3 * W) / 4, 14, 7);
  g.globalAlpha = 1;
  // Paddles: yours (left) in the accent, the other white.
  g.fillRect(
    PADDLE_X[0] - PADDLE_W,
    s.paddles[0] - PADDLE_H / 2,
    PADDLE_W,
    PADDLE_H,
  );
  g.fillStyle = "#fff";
  g.fillRect(PADDLE_X[1], s.paddles[1] - PADDLE_H / 2, PADDLE_W, PADDLE_H);
  if (s.ball)
    g.fillRect(s.ball[0] - BALL / 2, s.ball[1] - BALL / 2, BALL, BALL);
  g.fillStyle = accent;
  if (s.rtt) {
    const ping = pingLabel(s.rtt);
    g.fillStyle = ping.color;
    text(ping.text, W, H + 9, 6, "right");
    g.fillStyle = accent;
  }
  if (s.lines.length) {
    g.globalAlpha = 0.85;
    g.fillStyle = "#000";
    g.fillRect(0, H / 2 - 24, W, 44);
    g.globalAlpha = 1;
    g.fillStyle = accent;
    s.lines.forEach((l, i) =>
      text(l, W / 2, H / 2 - 6 + i * 13, i === 0 ? 11 : 7),
    );
  }
}

/** Keys held and the finger's place, turned into a paddle move each frame. */
function pad(f: Fit) {
  const held = new Set<string>();
  let touchY: number | null = null;
  return {
    key(key: string, down: boolean) {
      if (down) held.add(key);
      else held.delete(key);
    },
    touch(y: number | null) {
      touchY = y === null ? null : (y - f.oy) / f.scale;
    },
    /** The paddle after `dt` ms of input. */
    move(y: number, dt: number): number {
      if (touchY !== null) {
        const max = (900 * dt) / 1000;
        return clampPaddle(y + Math.max(-max, Math.min(max, touchY - y)));
      }
      const dir =
        (held.has("ArrowDown") || held.has("s") ? 1 : 0) -
        (held.has("ArrowUp") || held.has("w") ? 1 : 0);
      return movePaddle(y, dir, dt);
    },
    fire: () => held.has(" ") || held.has("Enter") || touchY !== null,
  };
}

/** Against the computer: the whole match runs here. */
export function playPongCpu(
  texts: PongTexts,
  onExit: (score: [number, number]) => void,
) {
  const { f, update } = fit();
  const controls = pad(f);
  let st: PongState = createPong(0);
  let firePrev = false;
  const shell = openGame({
    texts,
    onResize: update,
    onKey: controls.key,
    onTouch: (_x, y, phase) => controls.touch(phase === "end" ? null : y),
    onExit: () => onExit(st.score),
  });
  let begun = false;
  shell.loop((now, dt) => {
    if (shell.started && !begun) {
      begun = true;
      st = createPong(now);
    }
    if (shell.started && !shell.paused) {
      for (let left = dt; left > 0; left -= 16) {
        const step = Math.min(16, left);
        st.paddles[0] = controls.move(st.paddles[0], step);
        st.paddles[1] = cpuPaddle(st, 1, step);
        stepBall(st, now - Math.max(0, left - 16), step);
      }
      const fire = controls.fire();
      if (st.winner !== null && fire && !firePrev) st = createPong(now);
      firePrev = fire;
    }
    const over = st.winner !== null;
    if (st.winner === 0) unlock("wall");
    draw(
      shell.g,
      shell.accent,
      f,
      {
        ball:
          over || now < st.serveAt
            ? over
              ? null
              : [st.ball.x, st.ball.y]
            : [st.ball.x, st.ball.y],
        paddles: st.paddles,
        score: st.score,
        labels: [texts.you, texts.cpu],
        lines: over
          ? [st.winner === 0 ? texts.win : texts.lose, texts.again]
          : [],
        rtt: 0,
      },
      shell.width,
      shell.height,
    );
  });
}

/** 1v1 online: creates a room (its link goes to `onRoom`) or joins `room`. */
export function playPongOnline(
  texts: PongTexts,
  versus: VersusTexts,
  {
    room,
    quick,
    onRoom,
    onExit,
  }: {
    room?: string;
    /** The lobby: play whoever else is looking (no link to send). */
    quick?: boolean;
    onRoom: (code: string) => void;
    onExit: (note?: string) => void;
  },
) {
  const { f, update } = fit();
  const controls = pad(f);
  let code = room;
  let token: string | undefined;
  let you = 0;
  let view: PongView | null = null;
  let viewAt = 0;
  let note: string | undefined;
  let overlay: string[] = [quick ? versus.searching : versus.waiting];
  /** Your paddle (moved here) and the other's (eased towards each snapshot), in server coordinates. */
  let myY = H / 2;
  let theirY: number | null = null;
  let sent = "";
  let sentAt = 0;
  /** Which way the paddle was going in the last report (-1, 0, 1). */
  let sentDir = 0;
  let firePrev = false;
  let askedAgain = false;

  const serverTime = serverClock();
  const rival = remoteTrack();
  const net = connect({
    open: () =>
      net.send(
        code
          ? { t: "pong.join", room: code, resume: token }
          : { t: quick ? "pong.quick" : "pong.create" },
      ),
    message(msg) {
      if (msg.t === "pong.room") {
        you = msg.you;
        token = msg.token;
        if (!code && !quick) onRoom(msg.room);
        code = msg.room;
        overlay =
          msg.players < 2
            ? [
                quick ? versus.searching : versus.waiting,
                versus.share.replace("{link}", `phas.dev/pong/${msg.room}`),
              ]
            : [];
      } else if (msg.t === "pong.start") {
        overlay = [];
        askedAgain = false;
      } else if (msg.t === "pong.state") {
        view = msg.view;
        viewAt = performance.now();
        serverTime.sample(msg.view.at, net.rtt() / 2, viewAt);
        rival.push(msg.view.at, msg.view.paddles[1 - you]);
        if (msg.view.winner === you) unlock("champion");
      } else if (msg.t === "pong.away") overlay = [versus.partnerAway];
      else if (msg.t === "pong.back") overlay = [];
      else if (msg.t === "pong.left") overlay = [(note = versus.partnerLeft)];
      else if (msg.t === "pong.error")
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
    onKey: controls.key,
    onTouch: (_x, y, phase) => controls.touch(phase === "end" ? null : y),
    onStart: () => net.send({ t: "pong.ready" }),
    onExit() {
      net.close();
      onExit(note);
    },
  });

  /** Mirrors a server x so that you are on the left. */
  const mx = (x: number) => (you === 0 ? x : W - x);

  shell.loop((_now, dt) => {
    const t = performance.now();
    const v = view;
    const active = shell.started && !shell.paused && !overlay.length;
    const before = myY;
    if (active && v && v.winner === null) myY = controls.move(myY, dt);
    const vy = dt > 0 ? ((myY - before) * 1000) / dt : 0;
    const dir = Math.abs(vy) < 1 ? 0 : Math.sign(vy);
    // The other paddle, a few snapshots back, at an even pace.
    if (v)
      theirY =
        rival.at(serverTime.now(t) - net.rtt() / 2) ?? v.paddles[1 - you];
    // Your paddle's place and speed, up to 30 times a second, and at once when it stops or turns: the
    // server reckons where it is from them until the next.
    const key = String(Math.round(myY * 10));
    if (active && (dir !== sentDir || (key !== sent && t - sentAt >= 33))) {
      sent = key;
      sentAt = t;
      sentDir = dir;
      net.send({
        t: "pong.input",
        y: Math.round(myY * 10) / 10,
        vy: Math.round(vy),
        rtt: Math.round(net.rtt()),
      });
    }
    // After a win, a press asks for another match.
    const fire = controls.fire();
    if (v?.winner !== null && v && fire && !firePrev && !askedAgain) {
      askedAgain = true;
      net.send({ t: "pong.again" });
    }
    firePrev = fire;

    let ball: [number, number] | null = null;
    const lines = [...overlay];
    if (v) {
      if (v.winner !== null && !lines.length)
        lines.push(
          v.winner === you ? texts.win : texts.lose,
          askedAgain ? texts.waitingAgain : texts.again,
        );
      else if (v.winner === null) {
        // The ball now: the snapshot played forward with the paddles as they are on this screen.
        const lead = overlay.length
          ? 0
          : Math.max(0, Math.min(250, serverTime.now(t) - v.at));
        const sim: PongState = {
          ball: { x: v.ball[0], y: v.ball[1], vx: v.ball[2], vy: v.ball[3] },
          paddles:
            you === 0
              ? [myY, theirY ?? v.paddles[1]]
              : [theirY ?? v.paddles[0], myY],
          score: [...v.score] as [number, number],
          serveAt: v.serveIn,
          winner: null,
          rally: 0,
        };
        let clock = 0;
        for (let left = lead; left > 0; left -= 8) {
          const step = Math.min(8, left);
          clock += step;
          // Stop at a point: the server says what happens next.
          if (stepBall(sim, clock, step) !== null) break;
        }
        if (clock >= v.serveIn || v.serveIn === 0)
          ball = [mx(sim.ball.x), sim.ball.y];
        else ball = [W / 2, H / 2];
      }
    }
    const score: [number, number] = v
      ? you === 0
        ? v.score
        : [v.score[1], v.score[0]]
      : [0, 0];
    draw(
      shell.g,
      shell.accent,
      f,
      {
        ball,
        paddles: [myY, theirY ?? H / 2],
        score,
        labels: [texts.you, texts.rival],
        lines,
        rtt: net.rtt(),
      },
      shell.width,
      shell.height,
    );
  });
}

export { WIN };
