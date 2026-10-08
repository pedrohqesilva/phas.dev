// Snake in the public arena: everyone online shares one grid, simulated on the server. This side sends
// turns and draws the snapshots: your snake in the accent, the others white with their names, the food,
// and a live top five. Hit a wall or any snake and you turn into food, then respawn a moment later.
//
// The server is far (about 160 ms there and back from Brazil), so the snakes are not drawn from the
// snapshots, which are always a little old: they are played forward here, tick by tick on the server's
// beat, to the tick a turn pressed now would reach the server on. Yours goes forward with the turns the
// server has not confirmed yet: a turn is sent for the tick you pressed it on, the server applies it on
// that same tick, and the snake turns on screen at once, on the cell you saw. The others go forward in a
// straight line, so everyone is drawn at the same moment and a head-to-head looks as it will play out;
// when one of them turns, the next snapshot moves it over. The server still decides who eats and who
// dies. Between ticks the snakes glide (snake-draw.ts), and a dropped connection reconnects on its own and
// takes the same snake back.
import { opposite, predict } from "./arena-predict.ts";
import { connect, pingLabel } from "./net.ts";
import {
  ARENA_COLS,
  ARENA_ROWS,
  ARENA_TICK_MS,
  type ArenaState,
  type Dir,
} from "./protocol.ts";
import { openGame, type GameTexts } from "./shell.ts";
import { drawSnake, swipe } from "./snake-draw.ts";

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
  /** From the welcome: takes this snake back after a dropped connection. */
  let token: string | undefined;
  let best = 0;
  let note: string | undefined;
  let reconnecting = false;
  /** Arrival time minus tick × tick length, for recent snapshots: the smallest is the beat with no jitter. */
  let offsets: number[] = [];
  /** Turns sent and not yet confirmed by the server. */
  let pending: { dir: Dir; at: number; seq: number }[] = [];
  let seq = 0;
  let wasAlive = false;
  /** Your snake as on screen this frame: the tick it is drawn at and where it is heading. */
  let shown: { tick: number; dir: Dir } | null = null;

  /** Ticks since the server's tick 0 arrived, on its beat, as a fraction. */
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
          // Confirmed turns leave the queue; a death or a new life starts it over.
          pending =
            me.alive && wasAlive ? pending.filter((p) => p.seq > me.ack) : [];
          wasAlive = me.alive;
        }
      } else if (msg.t === "arena.full") note = texts.full;
    },
    reconnecting() {
      // The beat and the unconfirmed turns belong to the old connection.
      reconnecting = true;
      offsets = [];
      pending = [];
    },
    close(opened) {
      reconnecting = false;
      note ??= opened ? texts.disconnected : texts.unreachable;
    },
  });

  const turn = (dir: Dir) => {
    if (!shown || !wasAlive || reconnecting || pending.length >= 3) return;
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
    // The moment drawn: the tick a turn pressed now reaches the server on, and how far into it we are.
    const ahead = beat(performance.now()) + net.rtt() / ARENA_TICK_MS;
    const tick = Math.floor(ahead);
    const progress = ahead - tick;

    // Every snake played forward to that tick (yours with your waiting turns), and one tick further for
    // the glide into the next cell.
    const eaten = new Set<number>();
    const sprites = s.snakes
      .filter((sn) => sn.alive && sn.body.length)
      .map((sn) => {
        const mine = sn.id === you;
        const turns = mine ? pending : [];
        const now0 = predict(sn, s, turns, tick);
        const now1 = predict(sn, s, turns, tick + 1);
        for (const c of now0.eaten) eaten.add(c);
        if (mine) shown = { tick, dir: now0.dir };
        const moved =
          now1.body[0] !== now0.body[0] || now1.body[1] !== now0.body[1];
        return {
          sn,
          mine,
          sprite: {
            body: now0.body,
            next: moved ? ([now1.body[0], now1.body[1]] as const) : null,
            growing: now1.body.length > now0.body.length,
          },
        };
      });
    if (!me?.alive) shown = null;

    // Food: small squares; the super grain a blinking white cell. What a snake is eating on screen is gone.
    g.globalAlpha = 0.85;
    for (let i = 0; i < s.food.length; i += 2) {
      if (eaten.has(s.food[i + 1] * ARENA_COLS + s.food[i])) continue;
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

    // Snakes: yours in the accent (drawn last, on top), the others white (bots dimmer) with their names.
    for (const { sn, mine, sprite } of sprites.sort(
      (a, b) => Number(a.mine) - Number(b.mine),
    )) {
      g.fillStyle = mine ? shell.accent : "#fff";
      const dim = mine ? 1 : sn.bot ? 0.45 : 0.75;
      drawSnake(
        g,
        sprite,
        cell,
        ox,
        oy,
        progress,
        (i, n) => (i === 0 ? 1 : Math.max(0.35, 1 - i / (n + 8))) * dim,
      );
      if (!mine) {
        g.globalAlpha = sn.bot ? 0.45 : 0.8;
        text(
          sn.bot ? `${sn.name} ${texts.bot}` : sn.name,
          ox + sprite.body[0] * cell + cell / 2,
          oy + sprite.body[1] * cell - 4,
          10,
          "center",
        );
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = shell.accent;

    // HUD: your score and best on the left, who is online in the middle, the round trip on the right,
    // the top five inside the arena's corner.
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
