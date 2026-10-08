// Tetris on screen: solo (scores go to the leaderboard) or versus online. The rules are in tetris-sim.ts.
// ← → move (held, they repeat), ↑ or X rotate, Z rotates back, ↓ drops faster, Space drops at once, C or
// Shift holds the piece. On touch: tap to rotate, drag sideways to move, drag down to drop faster, a quick
// flick down drops at once.
//
// Versus: both players run their own game on the same pieces (the server's seed). Each sends its board a
// few times a second (drawn small beside the other's well) and its attacks: clearing 2, 3 or 4 lines at
// once sends 1, 2 or 4 garbage lines. Incoming garbage waits for your next piece to land, and lines you
// clear first cancel it. Top out and the other player wins; then both press to play again.
import { connect, pingLabel } from "./net.ts";
import type { VersusTexts } from "./pong.ts";
import { openGame, type GameTexts } from "./shell.ts";
import {
  addGarbage,
  ATTACK,
  cellsOf,
  colorOf,
  COLS,
  createTetris,
  down,
  ghost,
  hardDrop,
  HIDDEN_ROWS,
  holdPiece,
  rotate,
  ROWS,
  shapeOf,
  shift,
  stepTetris,
  visibleRows,
  wellString,
  type TetrisState,
} from "./tetris-sim.ts";

export interface TetrisTexts extends GameTexts {
  score: string;
  lines: string;
  level: string;
  next: string;
  hold: string;
  over: string;
  again: string;
  rival: string;
  win: string;
  lose: string;
  waitingAgain: string;
}

/** Piece colours by index (1 to 7), then garbage: the classic hues, a little softer on black. */
const COLORS = [
  "",
  "#4dd0e1",
  "#f4d35e",
  "#b388ff",
  "#69db7c",
  "#ff6b6b",
  "#5c9cff",
  "#ffa94d",
  "#6b6f76",
];
const DAS_MS = 160;
const ARR_MS = 45;
const SOFT_MS = 35;

/** Keyboard (with auto-repeat for moves) and touch, turned into game actions. */
function controls(cellPx: () => number) {
  const held = new Map<string, number>();
  let touch: {
    x: number;
    y: number;
    t: number;
    moved: boolean;
    sx: number;
    sy: number;
  } | null = null;
  const queue: ((st: TetrisState, now: number) => void)[] = [];
  return {
    key(key: string, isDown: boolean, e: KeyboardEvent) {
      if (!isDown) return void held.delete(key);
      if (e.repeat) return;
      held.set(key, performance.now());
      const act: Record<string, (st: TetrisState, now: number) => void> = {
        ArrowLeft: (st, now) => shift(st, -1, now),
        a: (st, now) => shift(st, -1, now),
        ArrowRight: (st, now) => shift(st, 1, now),
        d: (st, now) => shift(st, 1, now),
        ArrowUp: (st, now) => rotate(st, 1, now),
        x: (st, now) => rotate(st, 1, now),
        w: (st, now) => rotate(st, 1, now),
        z: (st, now) => rotate(st, -1, now),
        ArrowDown: (st, now) => down(st, now, true),
        s: (st, now) => down(st, now, true),
        " ": (st, now) => hardDrop(st, now),
        c: (st, now) => holdPiece(st, now),
        Shift: (st, now) => holdPiece(st, now),
      };
      if (act[key]) queue.push(act[key]);
    },
    touch(x: number, y: number, phase: "start" | "move" | "end") {
      const now = performance.now();
      if (phase === "start")
        return void (touch = { x, y, t: now, moved: false, sx: x, sy: y });
      if (!touch) return;
      const c = cellPx();
      if (phase === "move") {
        // Sideways, a column per cell dragged; down, a row per cell dragged.
        while (x - touch.x >= c)
          ((touch.x += c),
            (touch.moved = true),
            queue.push((st, n) => shift(st, 1, n)));
        while (touch.x - x >= c)
          ((touch.x -= c),
            (touch.moved = true),
            queue.push((st, n) => shift(st, -1, n)));
        while (y - touch.y >= c)
          ((touch.y += c),
            (touch.moved = true),
            queue.push((st, n) => down(st, n, true)));
        return;
      }
      const flick = y - touch.sy > c * 3 && now - touch.t < 250;
      if (flick) queue.push((st, n) => hardDrop(st, n));
      else if (!touch.moved && Math.hypot(x - touch.sx, y - touch.sy) < 12)
        queue.push((st, n) => rotate(st, 1, n));
      touch = null;
    },
    /** Runs what was pressed, and the repeats of held moves. */
    apply(st: TetrisState, now: number) {
      for (const act of queue.splice(0)) act(st, now);
      const t = performance.now();
      for (const [key, since] of held) {
        const dir =
          key === "ArrowLeft" || key === "a"
            ? -1
            : key === "ArrowRight" || key === "d"
              ? 1
              : 0;
        if (dir && t - since >= DAS_MS) {
          shift(st, dir, now);
          held.set(key, since + ARR_MS);
        }
        if ((key === "ArrowDown" || key === "s") && t - since >= SOFT_MS) {
          down(st, now, true);
          held.set(key, since + SOFT_MS);
        }
      }
    },
    fire: () => held.has(" ") || held.has("Enter"),
    clear: () => {
      queue.length = 0;
    },
  };
}

interface Layout {
  cell: number;
  x: number;
  y: number;
}

function layout(versus: boolean): Layout {
  const cell = Math.max(
    10,
    Math.floor(
      Math.min(
        (innerHeight - 60) / ROWS,
        (innerWidth * (versus ? 0.45 : 0.6)) / (COLS + 8),
      ),
    ),
  );
  const total = cell * (COLS + (versus ? 14 : 8));
  return {
    cell,
    x: Math.floor((innerWidth - total) / 2) + cell * 5,
    y: Math.floor((innerHeight - cell * ROWS) / 2) + 10,
  };
}

interface Extra {
  opponent?: { cells: string; score: number; lines: number } | null;
  incoming?: number;
  lines: string[];
  rtt?: number;
}

function draw(
  g: CanvasRenderingContext2D,
  accent: string,
  L: Layout,
  st: TetrisState,
  texts: TetrisTexts,
  now: number,
  w: number,
  h: number,
  extra: Extra,
) {
  const dpr = devicePixelRatio || 1;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#000";
  g.fillRect(0, 0, w, h);
  const { cell, x: ox, y: oy } = L;
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
  const block = (
    x: number,
    y: number,
    color: number,
    size = cell,
    alpha = 1,
  ) => {
    g.globalAlpha = alpha;
    g.fillStyle = COLORS[color];
    g.fillRect(x + 1, y + 1, size - 2, size - 2);
  };
  // The well: its frame and a faint grid.
  g.strokeStyle = accent;
  g.globalAlpha = 0.4;
  g.lineWidth = 1;
  g.strokeRect(ox - 0.5, oy - 0.5, cell * COLS + 1, cell * ROWS + 1);
  g.globalAlpha = 0.06;
  g.fillStyle = "#fff";
  for (let c = 1; c < COLS; c++) g.fillRect(ox + c * cell, oy, 1, cell * ROWS);
  g.globalAlpha = 1;
  visibleRows(st).forEach((row, r) =>
    row.forEach((c, x) => c && block(ox + x * cell, oy + r * cell, c)),
  );
  // Lines that just cleared flash white for a moment.
  if (now - st.flashAt < 160)
    for (const r of st.flashRows) {
      g.globalAlpha = 0.6;
      g.fillStyle = "#fff";
      g.fillRect(ox, oy + r * cell, cell * COLS, cell);
    }
  if (st.piece) {
    const gh = ghost(st)!;
    for (const [x, y] of cellsOf(gh))
      if (y >= HIDDEN_ROWS) {
        g.globalAlpha = 0.35;
        g.strokeStyle = COLORS[colorOf(gh.kind)];
        g.strokeRect(
          ox + x * cell + 1.5,
          oy + (y - HIDDEN_ROWS) * cell + 1.5,
          cell - 3,
          cell - 3,
        );
      }
    for (const [x, y] of cellsOf(st.piece))
      if (y >= HIDDEN_ROWS)
        block(
          ox + x * cell,
          oy + (y - HIDDEN_ROWS) * cell,
          colorOf(st.piece.kind),
        );
  }
  g.globalAlpha = 1;
  // Incoming garbage: a red bar beside the well, one cell per line waiting.
  if (extra.incoming) {
    g.fillStyle = "#ff4d4d";
    g.fillRect(
      ox - 6,
      oy + cell * (ROWS - Math.min(ROWS, extra.incoming)),
      3,
      cell * Math.min(ROWS, extra.incoming),
    );
  }
  // Left panel: hold, score, lines, level. Right: the next pieces.
  const small = Math.max(6, Math.floor(cell * 0.6));
  const piece = (kind: number, x: number, y: number) => {
    for (const [cx, cy] of shapeOf(kind))
      block(x + cx * small, y + cy * small, colorOf(kind), small);
    g.globalAlpha = 1;
  };
  g.fillStyle = accent;
  const lx = ox - cell * 5;
  text(texts.hold, lx, oy + 10, 11);
  if (st.hold !== null) piece(st.hold, lx, oy + 18);
  g.fillStyle = accent;
  text(texts.score, lx, oy + cell * 5, 11);
  text(String(st.score), lx, oy + cell * 5 + 18, 15);
  text(texts.lines, lx, oy + cell * 7, 11);
  text(String(st.lines), lx, oy + cell * 7 + 18, 15);
  text(texts.level, lx, oy + cell * 9, 11);
  text(String(st.level), lx, oy + cell * 9 + 18, 15);
  const rx = ox + cell * COLS + cell * 0.8;
  text(texts.next, rx, oy + 10, 11);
  st.next.slice(0, 3).forEach((k, i) => piece(k, rx, oy + 18 + i * small * 3));
  // Versus: the other player's well, small, beside yours.
  if (extra.opponent !== undefined) {
    const oc = Math.max(4, Math.floor(cell * 0.45));
    const px = rx + small * 5;
    const py = oy + cell * 6;
    g.fillStyle = "#fff";
    g.globalAlpha = 0.7;
    text(texts.rival, px, py - 8, 11);
    g.globalAlpha = 0.35;
    g.strokeStyle = "#fff";
    g.strokeRect(px - 0.5, py - 0.5, oc * COLS + 1, oc * ROWS + 1);
    g.globalAlpha = 1;
    const cells = extra.opponent?.cells ?? "";
    for (let i = 0; i < cells.length; i++) {
      const c = Number(cells[i]);
      if (c) block(px + (i % COLS) * oc, py + Math.floor(i / COLS) * oc, c, oc);
    }
    g.globalAlpha = 1;
    g.fillStyle = "#fff";
    if (extra.opponent)
      text(`${extra.opponent.score}`, px, py + oc * ROWS + 16, 11);
  }
  if (extra.rtt) {
    const ping = pingLabel(extra.rtt);
    g.fillStyle = ping.color;
    text(ping.text, ox + cell * COLS, oy + cell * ROWS + 16, 11, "right");
  }
  if (extra.lines.length) {
    g.globalAlpha = 0.85;
    g.fillStyle = "#000";
    g.fillRect(ox - cell, oy + cell * 7, cell * (COLS + 2), cell * 5);
    g.globalAlpha = 1;
    g.fillStyle = accent;
    extra.lines.forEach((l, i) =>
      text(
        l,
        ox + (cell * COLS) / 2,
        oy + cell * 9 + i * 20,
        i === 0 ? 16 : 11,
        "center",
      ),
    );
  }
  g.globalAlpha = 1;
}

/** Solo: `onRound` gets each game's score (for the leaderboard), `onExit` the best of the session. */
export function playTetris(
  texts: TetrisTexts,
  onExit: (best: number) => void,
  onRound?: (score: number) => void,
) {
  let L = layout(false);
  const pad = controls(() => L.cell);
  let st = createTetris(Math.floor(Math.random() * 2 ** 31), 0);
  let best = 0;
  let begun = false;
  let wasOver = false;
  let firePrev = false;
  const shell = openGame({
    texts,
    onResize: () => (L = layout(false)),
    onKey: pad.key,
    onTouch: pad.touch,
    onExit: () => onExit(Math.max(best, st.score)),
  });
  shell.loop((now) => {
    if (shell.started && !begun) {
      begun = true;
      st = createTetris(Math.floor(Math.random() * 2 ** 31), now);
    }
    if (shell.started && !shell.paused && !st.over) {
      pad.apply(st, now);
      stepTetris(st, now);
    }
    if (st.over && !wasOver) {
      best = Math.max(best, st.score);
      onRound?.(st.score);
      pad.clear();
    }
    wasOver = st.over;
    // After the end, Space (or a tap, which queues a rotate) starts again.
    const fire = pad.fire();
    if (st.over && fire && !firePrev)
      st = createTetris(Math.floor(Math.random() * 2 ** 31), now);
    firePrev = fire;
    draw(shell.g, shell.accent, L, st, texts, now, shell.width, shell.height, {
      lines: st.over ? [texts.over, texts.again] : [],
    });
  });
}

/** Versus online: creates a room (its link goes to `onRoom`) or joins `room`. */
export function playTetrisVersus(
  texts: TetrisTexts,
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
  let L = layout(true);
  const pad = controls(() => L.cell);
  let code = room;
  let token: string | undefined;
  let st: TetrisState | null = null;
  let opponent: { cells: string; score: number; lines: number } | null = null;
  let incoming = 0;
  let incomingHole = 0;
  let result: boolean | null = null;
  let askedAgain = false;
  let note: string | undefined;
  let overlay: string[] = [versus.waiting];
  let sentBoard = "";
  let sentAt = 0;
  let firePrev = false;
  let lastLocks = 0;
  /** A match starts when both are in and past the tutorial; the seed comes with it. */
  let pendingSeed: number | null = null;

  const net = connect({
    open: () =>
      net.send(
        code
          ? { t: "tetris.join", room: code, resume: token }
          : { t: "tetris.create" },
      ),
    message(msg) {
      if (msg.t === "tetris.room") {
        token = msg.token;
        if (!code) onRoom(msg.room);
        code = msg.room;
        overlay =
          msg.players < 2
            ? [
                versus.waiting,
                versus.share.replace("{link}", `phas.dev/tetris/${msg.room}`),
              ]
            : [];
      } else if (msg.t === "tetris.start") {
        pendingSeed = msg.seed;
        overlay = [];
      } else if (msg.t === "tetris.opponent")
        opponent = { cells: msg.cells, score: msg.score, lines: msg.lines };
      else if (msg.t === "tetris.garbage") {
        incoming += msg.lines;
        incomingHole = msg.hole;
      } else if (msg.t === "tetris.result") result = msg.won;
      else if (msg.t === "tetris.away") overlay = [versus.partnerAway];
      else if (msg.t === "tetris.back") overlay = [];
      else if (msg.t === "tetris.left") overlay = [(note = versus.partnerLeft)];
      else if (msg.t === "tetris.error")
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
    onResize: () => (L = layout(true)),
    onKey: pad.key,
    onTouch: pad.touch,
    onStart: () => net.send({ t: "tetris.ready" }),
    onExit() {
      net.close();
      onExit(note);
    },
  });

  // Until the match starts, an empty well is drawn behind the messages.
  const idle = createTetris(0, 0);
  idle.piece = null;

  shell.loop((now) => {
    if (pendingSeed !== null) {
      st = createTetris(pendingSeed, now);
      pendingSeed = null;
      opponent = null;
      incoming = 0;
      result = null;
      askedAgain = false;
      lastLocks = 0;
    }
    const playing = st && !st.over && result === null && !overlay.length;
    if (st && playing) {
      st.cleared = 0;
      pad.apply(st, now);
      const cleared = stepTetris(st, now);
      // Lines cleared cancel garbage waiting for you first; what is left goes to the other player.
      let attack = ATTACK[cleared] ?? 0;
      const cancel = Math.min(incoming, attack);
      incoming -= cancel;
      attack -= cancel;
      if (attack > 0) net.send({ t: "tetris.attack", lines: attack });
      // Garbage still waiting rises when a piece lands without clearing anything.
      if (st.locks !== lastLocks && cleared === 0 && incoming > 0) {
        addGarbage(st, incoming, incomingHole);
        incoming = 0;
      }
      lastLocks = st.locks;
      if (st.over) net.send({ t: "tetris.over" });
    }
    // Your board for the other player, about 8 times a second when it changed.
    if (st && performance.now() - sentAt > 120) {
      const cells = wellString(st);
      if (cells !== sentBoard) {
        sentBoard = cells;
        sentAt = performance.now();
        net.send({
          t: "tetris.board",
          cells,
          score: st.score,
          lines: st.lines,
        });
      }
    }
    // After a match, a press asks for another.
    const fire = pad.fire();
    if (result !== null && fire && !firePrev && !askedAgain) {
      askedAgain = true;
      net.send({ t: "tetris.again" });
    }
    firePrev = fire;
    const lines = overlay.length
      ? overlay
      : result !== null
        ? [
            result ? texts.win : texts.lose,
            askedAgain ? texts.waitingAgain : texts.again,
          ]
        : [];
    draw(
      shell.g,
      shell.accent,
      L,
      st ?? idle,
      texts,
      now,
      shell.width,
      shell.height,
      {
        opponent,
        incoming,
        lines,
        rtt: net.rtt(),
      },
    );
  });
}
