// Snake in the public arena: everyone online shares one grid, simulated on the server. This side sends
// turns and draws the snapshots: your snake in the accent, the others white with their names, the food,
// the power-ups and a live top five. Hit a wall or any snake and you turn into food, then respawn.
// Small snakes are quick and big ones slow (arena-rules.ts); the red power-up makes you faster for 5 s and
// the green one shields you for 5 s (you go through snakes and walls).
//
// The server is far (about 160 ms there and back from Brazil), so your snake is not drawn from the
// snapshots, which are always a little old: it is played forward here, beat by beat on the server's own
// rules, to the beat a turn pressed now would reach the server on, with the turns the server has not used
// yet. A turn is sent for your snake's next step as you see it, the server applies it on that step, and
// the snake turns on screen at once. The other snakes are drawn a moment in the past, gliding into the
// cell they last stepped into: only steps that already happened, so they never jump back. The beat itself
// is smoothed, so a jittery network does not shake the picture. The server still decides who eats and who
// dies. A dropped connection reconnects on its own and takes the same snake back.
import { opposite, predict, type Predicted } from "./arena-predict.ts";
import { moveInterval } from "./arena-rules.ts";
import { connect, pingLabel } from "./net.ts";
import {
  ARENA_COLS,
  ARENA_ROWS,
  ARENA_TICK_MS,
  type ArenaState,
  type Dir,
} from "./protocol.ts";
import { openGame, type GameTexts } from "./shell.ts";
import { drawSnakeArriving, swipe } from "./snake-draw.ts";

export interface ArenaTexts extends GameTexts {
  score: string;
  best: string;
  online: (n: number) => string;
  top: string;
  respawn: string;
  connecting: string;
  reconnecting: string;
  disconnected: string;
  unreachable: string;
  full: string;
  bot: string;
  /** Labels for your active power-ups, with the seconds left after them. */
  speed: string;
  shield: string;
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 0,
  w: 0,
  ArrowRight: 1,
  d: 1,
  ArrowDown: 2,
  s: 2,
  ArrowLeft: 3,
  a: 3,
};

/** Power-up colours, by kind: the super grain white, faster red, shield green. */
const POWER_COLORS = ["#ffffff", "#ff4d4d", "#3ddc84"];
/** The others are drawn this many beats behind the latest snapshot's beat: room for network jitter. */
const OTHERS_DELAY = 2.5;
/** Your snake is drawn this many beats beyond the round trip: room for jitter on the way up. */
const OWN_MARGIN = 1;

/** Joins the arena as `name`; `onExit` gets the best score of the session and an error, if any. */
export function playSnakeArena(
  texts: ArenaTexts,
  name: string,
  onExit: (best: number, note?: string) => void,
) {
  let state: ArenaState | null = null;
  let you = -1;
  /** From the welcome: takes this snake back after a dropped connection. */
  let token: string | undefined;
  let best = 0;
  let note: string | undefined;
  let reconnecting = false;
  /** Arrival time minus beat × beat length, for recent snapshots: the smallest is the beat with no jitter. */
  let offsets: number[] = [];
  /** The beat on screen: follows the network's, smoothed. Null until the first snapshot. */
  let shownBeat: number | null = null;
  let smoothRtt = 0;
  /** Turns sent and not yet used by the server. */
  let pending: { dir: Dir; at: number; seq: number }[] = [];
  let seq = 0;
  let wasAlive = false;
  /** Your snake as on screen this frame. */
  let mine: Predicted | null = null;

  /** Beats since the server's beat 0, by the network: when the latest snapshot "should" have arrived. */
  const beat = (t: number) => (t - Math.min(...offsets)) / ARENA_TICK_MS;
  let cell = 10;
  let ox = 0;
  let oy = 0;

  const net = connect({
    open() {
      reconnecting = false;
      net.send({ t: "arena.join", name, resume: token });
    },
    message(msg) {
      if (msg.t === "arena.welcome") {
        you = msg.you;
        token = msg.token;
      } else if (msg.t === "arena.state") {
        state = msg.state;
        offsets.push(performance.now() - state.tick * ARENA_TICK_MS);
        if (offsets.length > 30) offsets.shift();
        const me = state.snakes.find((s) => s.id === you);
        if (me) {
          best = Math.max(best, me.score);
          // Used turns leave the queue; a death or a new life starts it over.
          pending =
            me.alive && wasAlive ? pending.filter((p) => p.seq > me.ack) : [];
          wasAlive = me.alive;
        }
      } else if (msg.t === "arena.full") note = texts.full;
    },
    reconnecting() {
      // The beat and the unused turns belong to the old connection.
      reconnecting = true;
      offsets = [];
      shownBeat = null;
      pending = [];
    },
    close(opened) {
      reconnecting = false;
      note ??= opened ? texts.disconnected : texts.unreachable;
    },
  });

  const turn = (dir: Dir) => {
    if (!mine || !wasAlive || reconnecting || pending.length >= 3) return;
    // Against where the snake will be heading after the turns still to come: the server ignores reversals
    // too, and repeats would only take up a step.
    const heading = mine.waiting.at(-1)?.dir ?? mine.dir;
    if (dir === heading || opposite(dir, heading)) return;
    // Meant for the snake's next step on screen (one turn per step, like the server takes them).
    const last = pending.at(-1);
    const at = Math.max(mine.nextMoveAt, (last?.at ?? 0) + 1);
    pending.push({ dir, at, seq: ++seq });
    net.send({ t: "arena.dir", dir, seq, at });
  };

  const shell = openGame({
    texts,
    live: true,
    onResize() {
      // Runs inside openGame on the first call, before `shell` exists: read the window. Room for the HUD on top.
      cell = Math.max(
        4,
        Math.floor(
          Math.min(innerWidth / ARENA_COLS, (innerHeight - 40) / ARENA_ROWS),
        ),
      );
      ox = Math.floor((innerWidth - cell * ARENA_COLS) / 2);
      oy = Math.floor((innerHeight - cell * ARENA_ROWS) / 2) + 14;
    },
    onKey(key, down) {
      if (down && key in KEYS) turn(KEYS[key]);
    },
    onTouch: swipe(turn),
    onExit() {
      net.close();
      onExit(best, note);
    },
  });
  const { g } = shell;

  const text = (
    str: string,
    x: number,
    y: number,
    size = 13,
    align: CanvasTextAlign = "left",
  ) => {
    g.font = `${size}px "Geist Mono Variable", ui-monospace, monospace`;
    g.textAlign = align;
    g.fillText(str, x, y);
  };

  /** How far (0 to 1) a snake is into its last step at beat `at`. */
  const progress = (
    at: number,
    movedAt: number,
    cells: number,
    boosted: boolean,
  ) => (at - movedAt) / (moveInterval(cells, boosted) / ARENA_TICK_MS);

  shell.loop((now, dt) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, shell.width, shell.height);
    g.fillStyle = shell.accent;
    g.strokeStyle = shell.accent;

    // The arena's edge: hitting it kills, so it is drawn.
    g.globalAlpha = 0.35;
    g.lineWidth = 1;
    g.strokeRect(
      ox - 0.5,
      oy - 0.5,
      cell * ARENA_COLS + 1,
      cell * ARENA_ROWS + 1,
    );
    g.globalAlpha = 1;

    if (!state || !offsets.length) {
      text(
        note ?? (reconnecting ? texts.reconnecting : texts.connecting),
        shell.width / 2,
        shell.height / 2,
        14,
        "center",
      );
      return;
    }
    const s = state;
    const me = s.snakes.find((sn) => sn.id === you);

    // The beat on screen runs at its own pace and leans gently towards the network's, so jitter and a
    // changing round trip do not shake the picture; a big gap (a stalled tab) snaps.
    const target = beat(performance.now());
    if (shownBeat === null || Math.abs(target - shownBeat) > 4)
      shownBeat = target;
    else shownBeat += dt / ARENA_TICK_MS + (target - shownBeat) * 0.05;
    smoothRtt = smoothRtt
      ? smoothRtt + (net.rtt() - smoothRtt) * 0.03
      : net.rtt();
    const ownBeat = shownBeat + smoothRtt / ARENA_TICK_MS + OWN_MARGIN;
    const othersBeat = shownBeat - OTHERS_DELAY;

    // Yours: played forward to the beat a turn pressed now reaches the server on.
    mine =
      me?.alive && me.body.length
        ? predict(me, s, pending, Math.floor(ownBeat))
        : null;
    const eaten = mine?.eaten ?? new Set<number>();

    // Food: small squares. Power-ups: a full cell in their colour, blinking faster in their last 2 s.
    g.globalAlpha = 0.85;
    const pad = Math.max(1, Math.round(cell * 0.3));
    for (let i = 0; i < s.food.length; i += 2) {
      if (eaten.has(s.food[i + 1] * ARENA_COLS + s.food[i])) continue;
      g.fillRect(
        ox + s.food[i] * cell + pad,
        oy + s.food[i + 1] * cell + pad,
        cell - pad * 2,
        cell - pad * 2,
      );
    }
    for (const [x, y, kind, left] of s.powers) {
      if (eaten.has(y * ARENA_COLS + x)) continue;
      const leftMs = left * ARENA_TICK_MS;
      g.globalAlpha =
        Math.floor(now / (leftMs < 2000 ? 90 : 260)) % 2 ? 1 : 0.5;
      g.fillStyle = POWER_COLORS[kind];
      g.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
    }
    g.globalAlpha = 1;

    // Snakes: the others first (white, bots dimmer, named), then yours in the accent, on top. Faster ones
    // turn red and shielded ones green while it lasts.
    const colorOf = (base: string, boost: number, shield: number) =>
      shield > 0
        ? Math.floor(now / (shield * ARENA_TICK_MS < 1500 ? 90 : 400)) % 2
          ? POWER_COLORS[2]
          : base
        : boost > 0
          ? POWER_COLORS[1]
          : base;
    for (const sn of s.snakes) {
      if (sn.id === you || !sn.alive || !sn.body.length) continue;
      const cells = sn.body.length / 2;
      const dim = sn.bot ? 0.45 : 0.75;
      g.fillStyle = colorOf("#fff", sn.boost, sn.shield);
      drawSnakeArriving(
        g,
        sn.body,
        sn.prevTail,
        cell,
        ox,
        oy,
        progress(othersBeat, sn.movedAt, cells, sn.boost > 0),
        (i, n) => (i === 0 ? 1 : Math.max(0.35, 1 - i / (n + 8))) * dim,
      );
      g.globalAlpha = sn.bot ? 0.45 : 0.8;
      g.fillStyle = "#fff";
      text(
        sn.bot ? `${sn.name} ${texts.bot}` : sn.name,
        ox + sn.body[0] * cell + cell / 2,
        oy + sn.body[1] * cell - 4,
        10,
        "center",
      );
    }
    if (mine) {
      g.fillStyle = colorOf(shell.accent, mine.boost, mine.shield);
      drawSnakeArriving(
        g,
        mine.body,
        mine.prevTail,
        cell,
        ox,
        oy,
        progress(ownBeat, mine.movedAt, mine.body.length / 2, mine.boost > 0),
        (i, n) => (i === 0 ? 1 : Math.max(0.35, 1 - i / (n + 8))),
      );
    }
    g.globalAlpha = 1;
    g.fillStyle = shell.accent;

    // HUD: score, best and your power-ups on the left, who is online in the middle, the round trip on the
    // right, the top five inside the arena's corner.
    g.globalAlpha = 0.8;
    const scoreText = `${texts.score} ${me?.score ?? 0}   ${texts.best} ${best}`;
    text(scoreText, ox, oy - 12);
    g.font = `13px "Geist Mono Variable", ui-monospace, monospace`;
    let hudX = ox + g.measureText(scoreText).width + 16;
    for (const [label, beats, color] of [
      [texts.speed, mine?.boost ?? 0, POWER_COLORS[1]],
      [texts.shield, mine?.shield ?? 0, POWER_COLORS[2]],
    ] as const) {
      if (beats <= 0) continue;
      const str = `${label} ${Math.ceil((beats * ARENA_TICK_MS) / 1000)}s`;
      g.fillStyle = color;
      text(str, hudX, oy - 12);
      hudX += g.measureText(str).width + 12;
    }
    g.fillStyle = shell.accent;
    text(
      texts.online(s.online),
      ox + (cell * ARENA_COLS) / 2,
      oy - 12,
      13,
      "center",
    );
    const ping = pingLabel(net.rtt());
    g.fillStyle = ping.color;
    text(ping.text, ox + cell * ARENA_COLS, oy - 12, 11, "right");
    g.fillStyle = shell.accent;
    g.globalAlpha = 0.6;
    text(texts.top, ox + cell * ARENA_COLS - 4, oy + 16, 11, "right");
    s.top.forEach(([who, score], i) =>
      text(
        `${who} ${score}`,
        ox + cell * ARENA_COLS - 4,
        oy + 32 + i * 15,
        11,
        "right",
      ),
    );
    g.globalAlpha = 1;

    const line = reconnecting
      ? texts.reconnecting
      : me && !me.alive
        ? texts.respawn
        : "";
    if (line) text(line, shell.width / 2, shell.height / 2, 15, "center");
    if (note) text(note, shell.width / 2, shell.height / 2 + 24, 13, "center");
  });
}
