// Co-op Space Invaders rooms: two players, one simulation running here (invaders-sim.ts, the same code the
// browser runs solo). A room starts once both players are in and past the tutorial. If a connection drops,
// the game pauses and that seat waits RESUME_MS for its player to come back (the page reconnects on its
// own, with the seat's token); after that the other player is told and the room closes.
import { randomUUID } from "node:crypto";
import {
  createInvaders,
  idleInput,
  restartInvaders,
  stepInvaders,
  viewInvaders,
  W,
  type ShipInput,
} from "../src/games/invaders-sim.ts";
import {
  RESUME_MS,
  ROOM_ALPHABET,
  type ServerMessage,
} from "../src/games/protocol.ts";

type Send = (msg: ServerMessage) => void;

/** Where a browser last said its ship was, how fast it was going, and when that report arrived. */
type Report = { x: number; vx: number; oneWay: number; at: number };

interface Room {
  code: string;
  players: (Send | null)[];
  tokens: string[];
  /** When each seat's connection dropped; null while connected. */
  away: (number | null)[];
  ready: boolean[];
  inputs: ShipInput[];
  /** The last position report per seat (null: an older page sending keys instead). */
  reports: (Report | null)[];
  sim: ReturnType<typeof createInvaders>;
  timer: ReturnType<typeof setInterval> | null;
  /** Game time in ms: it only advances while both players are connected. */
  clock: number;
  expiry: ReturnType<typeof setTimeout> | null;
}

const STEP_MS = 16;
/** Snapshots go out every other step: about 30 per second. */
const SEND_EVERY = 2;
const MAX_ROOMS = 200;
/**
 * How fast the server lets a ship follow its browser: above the fastest the ship can move there (touch,
 * 140 per second), so it keeps up, but capped, so a tampered page cannot teleport.
 */
const FOLLOW_SPEED = 260;
/** The fastest a ship moves, and the most a report is projected ahead, for the bomb check. */
const MAX_SHIP_SPEED = 140;
const MAX_PROJECT_MS = 200;

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/**
 * Accepts only a well-formed input; anything else counts as "nothing pressed". A position report (`x`)
 * moves the ship, and its fire button is the only key; older pages still send keys.
 */
function cleanInput(raw: unknown): {
  input: ShipInput;
  report: Omit<Report, "at"> | null;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (finite(r.x))
    return {
      input: { ...idleInput(), fire: r.fire === true },
      report: {
        x: clamp(r.x, 8, W - 8),
        vx: finite(r.vx) ? clamp(r.vx, -MAX_SHIP_SPEED, MAX_SHIP_SPEED) : 0,
        oneWay: finite(r.rtt) ? clamp(r.rtt / 2, 0, 150) : 0,
      },
    };
  return {
    input: {
      left: r.left === true,
      right: r.right === true,
      fire: r.fire === true,
      touchX: finite(r.touchX) ? clamp(r.touchX, 0, W) : null,
    },
    report: null,
  };
}

export function createCoop() {
  const rooms = new Map<string, Room>();

  const newCode = () => {
    for (;;) {
      const code = Array.from(
        { length: 4 },
        () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)],
      ).join("");
      if (!rooms.has(code)) return code;
    }
  };

  /** One step: ships follow their reports, then the shared simulation runs. */
  function step(room: Room) {
    const wall = performance.now();
    room.reports.forEach((report, i) => {
      const ship = room.sim.ships[i];
      if (!report || !ship) return;
      const max = (FOLLOW_SPEED * STEP_MS) / 1000;
      ship.x += clamp(report.x - ship.x, -max, max);
      // Bombs are checked against where the ship is on its player's screen right now: the last report,
      // carried forward by its speed for the time since it was sent.
      const ahead = Math.min(
        MAX_PROJECT_MS,
        report.oneWay + (wall - report.at),
      );
      ship.hitX = clamp(report.x + (report.vx * ahead) / 1000, 8, W - 8);
    });
    room.clock += STEP_MS;
    stepInvaders(room.sim, room.inputs, room.clock, STEP_MS);
  }

  function start(room: Room) {
    if (
      room.timer ||
      !room.players.every(Boolean) ||
      !room.ready.every(Boolean)
    )
      return;
    room.clock = 0;
    restartInvaders(room.sim, 0);
    room.sim.best = 0;
    for (const send of room.players) send?.({ t: "coop.start" });
    let n = 0;
    room.timer = setInterval(() => {
      // Paused while someone is reconnecting.
      if (room.away.some((a) => a !== null)) return;
      step(room);
      if (++n % SEND_EVERY) return;
      const msg: ServerMessage = {
        t: "coop.state",
        view: viewInvaders(room.sim, room.clock),
      };
      for (const send of room.players) send?.(msg);
    }, STEP_MS);
  }

  function close(room: Room) {
    if (room.timer) clearInterval(room.timer);
    if (room.expiry) clearTimeout(room.expiry);
    rooms.delete(room.code);
  }

  const announce = (room: Room) =>
    room.players.forEach((send, you) =>
      send?.({
        t: "coop.room",
        room: room.code,
        you,
        players: room.players.filter(Boolean).length,
        token: room.tokens[you],
      }),
    );

  const others = (room: Room, you: number) =>
    room.players.filter((_, i) => i !== you);

  return {
    /** A new room with this player as P1; null when the server is at its room limit. */
    create(send: Send): { code: string; you: number } | null {
      if (rooms.size >= MAX_ROOMS) return null;
      const room: Room = {
        code: newCode(),
        players: [send, null],
        tokens: [randomUUID(), randomUUID()],
        away: [null, null],
        ready: [false, false],
        inputs: [idleInput(), idleInput()],
        reports: [null, null],
        sim: createInvaders(2),
        timer: null,
        clock: 0,
        expiry: null,
      };
      rooms.set(room.code, room);
      announce(room);
      return { code: room.code, you: 0 };
    },
    /** Takes the free seat, or, with a seat's token, takes that seat back after a dropped connection. */
    join(
      code: string,
      send: Send,
      resume?: string,
    ): { code: string; you: number } | null {
      const room = rooms.get(code.toUpperCase());
      if (!room) {
        send({ t: "coop.error", reason: "not-found" });
        return null;
      }
      const back = resume ? room.tokens.indexOf(resume) : -1;
      if (back >= 0 && room.away[back] !== null) {
        room.players[back] = send;
        room.away[back] = null;
        if (room.away.every((a) => a === null) && room.expiry) {
          clearTimeout(room.expiry);
          room.expiry = null;
        }
        announce(room);
        if (room.timer) send({ t: "coop.start" });
        for (const other of others(room, back)) other?.({ t: "coop.back" });
        return { code: room.code, you: back };
      }
      const you = room.players.findIndex(
        (p, i) => p === null && room.away[i] === null,
      );
      if (you < 0) {
        send({ t: "coop.error", reason: "full" });
        return null;
      }
      room.players[you] = send;
      announce(room);
      start(room);
      return { code: room.code, you };
    },
    ready(code: string, you: number) {
      const room = rooms.get(code);
      if (!room) return;
      room.ready[you] = true;
      start(room);
    },
    input(code: string, you: number, raw: unknown) {
      const room = rooms.get(code);
      if (!room) return;
      const { input, report } = cleanInput(raw);
      room.inputs[you] = input;
      room.reports[you] = report && { ...report, at: performance.now() };
      if (!report) room.sim.ships[you].hitX = undefined;
    },
    /** A connection dropped: the seat waits RESUME_MS for its player; then the room closes. */
    leave(code: string, you: number) {
      const room = rooms.get(code);
      if (!room) return;
      room.players[you] = null;
      room.inputs[you] = idleInput();
      room.away[you] = Date.now();
      if (room.players.every((p) => p === null)) {
        close(room);
        return;
      }
      for (const other of others(room, you)) other?.({ t: "coop.away" });
      if (room.expiry) clearTimeout(room.expiry);
      room.expiry = setTimeout(() => {
        for (const send of room.players) send?.({ t: "coop.left" });
        close(room);
      }, RESUME_MS);
    },
  };
}
