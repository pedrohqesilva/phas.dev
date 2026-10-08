// Snake in the public arena: everyone online shares one grid, simulated on the server. This side sends
// turns and draws the snapshots: your snake in the accent, the others white with their names, the food,
// and a live top five. Hit a wall or any snake and you turn into food, then respawn a moment later.
//
// The server is far (about 160 ms there and back from Brazil), so your own snake is not drawn from the
// snapshots, which are always a little old: it is played forward here, tick by tick on the server's beat,
// from the last snapshot and the turns the server has not confirmed yet. A turn is sent for the tick you
// pressed it on, the server applies it on that same tick, and the snake turns on screen at once, on the
// cell you saw. The server still decides who eats and who dies; the next snapshot corrects any slip.
// The other snakes are drawn on the same beat, so network jitter does not make them stutter.
import { opposite, predict } from "./arena-predict.ts";
import { connect } from "./net.ts";
import {
  ARENA_COLS,
  ARENA_ROWS,
  ARENA_TICK_MS,
  type ArenaState,
  type Dir,
} from "./protocol.ts";
import { openGame, type GameTexts } from "./shell.ts";

export interface ArenaTexts extends GameTexts {
  score: string;
  best: string;
  online: (n: number) => string;
  top: string;
  respawn: string;
  connecting: string;
  disconnected: string;
  unreachable: string;
  full: string;
  bot: string;
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

/** Joins the arena as `name`; `onExit` gets the best score of the session and an error, if any. */
export function playSnakeArena(
  texts: ArenaTexts,
  name: string,
  onExit: (best: number, note?: string) => void,
) {
  let state: ArenaState | null = null;
  let you = -1;
  let best = 0;
  let note: string | undefined;
  /** Recent snapshots by tick, to draw the others on a steady beat. */
  const recent = new Map<number, ArenaState>();
  /** Arrival time minus tick × tick length, for recent snapshots: the smallest is the beat with no jitter. */
  const offsets: number[] = [];
  /** Turns sent and not yet confirmed by the server. */
  let pending: { dir: Dir; at: number; seq: number }[] = [];
  let seq = 0;
  let wasAlive = false;
  /** What is on screen for your snake, updated every frame. */
  let shown: { tick: number; dir: Dir; body: number[]; eaten: Set<number> } | null = null;

  /** The tick whose snapshot should be arriving now, give or take jitter. */
  const beat = (t: number) => (t - Math.min(...offsets)) / ARENA_TICK_MS;
  let touchFrom: { x: number; y: number } | null = null;
  let cell = 10;
  let ox = 0;
  let oy = 0;

  const net = connect({
    open: () => net.send({ t: "arena.join", name }),
    message(msg) {
      if (msg.t === "arena.welcome") you = msg.you;
      else if (msg.t === "arena.state") {
        state = msg.state;
        recent.set(state.tick, state);
        recent.delete(state.tick - 12);
        offsets.push(performance.now() - state.tick * ARENA_TICK_MS);
        if (offsets.length > 30) offsets.shift();
        const me = state.snakes.find((s) => s.id === you);
        if (me) {
          best = Math.max(best, me.score);
          // Confirmed turns leave the queue; a death or a new life starts it over.
          pending = me.alive && wasAlive ? pending.filter((p) => p.seq > me.ack) : [];
          wasAlive = me.alive;
        }
      } else if (msg.t === "arena.full") note = texts.full;
    },
    close(opened) {
      note ??= opened ? texts.disconnected : texts.unreachable;
    },
  });

  const turn = (dir: Dir) => {
    if (!shown || !wasAlive || pending.length >= 3) return;
    // Against where the snake will be heading after the turns still to come: the server ignores reversals
    // too, and repeats would only take up a tick.
    const last = pending.at(-1);
    const heading = last && last.at > shown.tick ? last.dir : shown.dir;
    if (dir === heading || opposite(dir, heading)) return;
    // Meant for the next tick on screen (one turn per tick, like the server takes them).
    const at = Math.max(shown.tick + 1, (last?.at ?? 0) + 1);
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
    onTouch(x, y, phase) {
      if (phase === "start") touchFrom = { x, y };
      if (phase !== "end" || !touchFrom) return;
      const dx = x - touchFrom.x;
      const dy = y - touchFrom.y;
      touchFrom = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    },
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

  shell.loop((now) => {
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

    if (!state) {
      text(
        note ?? texts.connecting,
        shell.width / 2,
        shell.height / 2,
        14,
        "center",
      );
      return;
    }
    const t = performance.now();
    // The others: the snapshot for this moment's beat (the latest if it is late).
    const now0 = Math.floor(beat(t));
    const s = recent.get(Math.min(now0, state.tick)) ?? state;
    const latest = state;
    const me = latest.snakes.find((sn) => sn.id === you);
    // Yours: played forward to the tick a turn pressed now would reach the server on.
    shown =
      me?.alive && me.body.length
        ? {
            tick: Math.floor(beat(t) + net.rtt() / ARENA_TICK_MS),
            ...predict(me, latest, pending, Math.floor(beat(t) + net.rtt() / ARENA_TICK_MS)),
          }
        : null;
    const mineEaten = shown?.eaten ?? new Set<number>();

    // Food: small squares; the super grain a blinking white cell.
    g.globalAlpha = 0.85;
    for (let i = 0; i < s.food.length; i += 2) {
      if (mineEaten.has(s.food[i + 1] * ARENA_COLS + s.food[i])) continue;
      const pad = Math.max(1, Math.round(cell * 0.3));
      g.fillRect(
        ox + s.food[i] * cell + pad,
        oy + s.food[i + 1] * cell + pad,
        cell - pad * 2,
        cell - pad * 2,
      );
    }
    if (s.superFood) {
      const [x, y, left] = s.superFood;
      g.globalAlpha = Math.floor(now / (left < 2000 ? 90 : 260)) % 2 ? 1 : 0.45;
      g.fillStyle = "#fff";
      g.fillRect(ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2);
      g.fillStyle = shell.accent;
    }

    // Snakes: yours in the accent, the others white (bots dimmer); dead ones are already food.
    for (const other of s.snakes) {
      const mine = other.id === you;
      const sn = mine ? { ...other, alive: !!shown, body: shown?.body ?? [] } : other;
      if (!sn.alive || !sn.body.length) continue;
      g.fillStyle = mine ? shell.accent : "#fff";
      const n = sn.body.length / 2;
      for (let i = 0; i < n; i++) {
        g.globalAlpha =
          (i === 0 ? 1 : Math.max(0.35, 1 - i / (n + 8))) *
          (mine ? 1 : sn.bot ? 0.45 : 0.75);
        g.fillRect(
          ox + sn.body[i * 2] * cell + 1,
          oy + sn.body[i * 2 + 1] * cell + 1,
          cell - 2,
          cell - 2,
        );
      }
      if (!mine) {
        g.globalAlpha = sn.bot ? 0.45 : 0.8;
        text(
          sn.bot ? `${sn.name} ${texts.bot}` : sn.name,
          ox + sn.body[0] * cell + cell / 2,
          oy + sn.body[1] * cell - 4,
          10,
          "center",
        );
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = shell.accent;

    // HUD: your score and best on the left, who is online in the middle, the top five on the right.
    g.globalAlpha = 0.8;
    text(
      `${texts.score} ${me?.score ?? 0}   ${texts.best} ${best}`,
      ox,
      oy - 12,
    );
    text(
      texts.online(s.online),
      ox + (cell * ARENA_COLS) / 2,
      oy - 12,
      13,
      "center",
    );
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

    if (me && !me.alive)
      text(texts.respawn, shell.width / 2, shell.height / 2, 15, "center");
    if (note) text(note, shell.width / 2, shell.height / 2 + 24, 13, "center");
  });
}
