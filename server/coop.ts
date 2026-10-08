// Co-op Space Invaders rooms: two players, one simulation running here (invaders-sim.ts, the same code the
// browser runs solo). A room starts once both players are in and past the tutorial; if one leaves, the
// other is told and the room closes.
import {
  createInvaders,
  idleInput,
  restartInvaders,
  stepInvaders,
  viewInvaders,
  W,
  type ShipInput,
} from "../src/games/invaders-sim.ts";
import { ROOM_ALPHABET, type ServerMessage } from "../src/games/protocol.ts";

type Send = (msg: ServerMessage) => void;

interface Room {
  code: string;
  players: (Send | null)[];
  ready: boolean[];
  inputs: ShipInput[];
  /** Where each browser says its ship is (null: an older page sending keys instead). */
  targets: (number | null)[];
  sim: ReturnType<typeof createInvaders>;
  timer: ReturnType<typeof setInterval> | null;
  startedAt: number;
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

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/**
 * Accepts only a well-formed input; anything else counts as "nothing pressed". A position report (`x`)
 * becomes the ship's target, and its fire button the only key; older pages still send keys.
 */
function cleanInput(raw: unknown): { input: ShipInput; target: number | null } {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (finite(r.x))
    return {
      input: { ...idleInput(), fire: r.fire === true },
      target: Math.max(8, Math.min(W - 8, r.x)),
    };
  return { input: legacyInput(r), target: null };
}

function legacyInput(r: Record<string, unknown>): ShipInput {
  const x =
    typeof r.touchX === "number" && Number.isFinite(r.touchX)
      ? Math.max(0, Math.min(W, r.touchX))
      : null;
  return {
    left: r.left === true,
    right: r.right === true,
    fire: r.fire === true,
    touchX: x,
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

  function start(room: Room) {
    if (
      room.timer ||
      !room.players.every(Boolean) ||
      !room.ready.every(Boolean)
    )
      return;
    room.startedAt = performance.now();
    restartInvaders(room.sim, 0);
    room.sim.best = 0;
    for (const send of room.players) send?.({ t: "coop.start" });
    let n = 0;
    room.timer = setInterval(() => {
      const now = performance.now() - room.startedAt;
      // Ships follow where their browsers put them, at a capped speed.
      room.targets.forEach((target, i) => {
        const ship = room.sim.ships[i];
        if (target === null || !ship) return;
        const step = (FOLLOW_SPEED * STEP_MS) / 1000;
        ship.x += Math.max(-step, Math.min(step, target - ship.x));
      });
      stepInvaders(room.sim, room.inputs, now, STEP_MS);
      if (++n % SEND_EVERY) return;
      const msg: ServerMessage = {
        t: "coop.state",
        view: viewInvaders(room.sim, now),
      };
      for (const send of room.players) send?.(msg);
    }, STEP_MS);
  }

  function close(room: Room) {
    if (room.timer) clearInterval(room.timer);
    rooms.delete(room.code);
  }

  const announce = (room: Room) =>
    room.players.forEach((send, you) =>
      send?.({
        t: "coop.room",
        room: room.code,
        you,
        players: room.players.filter(Boolean).length,
      }),
    );

  return {
    /** A new room with this player as P1; null when the server is at its room limit. */
    create(send: Send): { code: string; you: number } | null {
      if (rooms.size >= MAX_ROOMS) return null;
      const room: Room = {
        code: newCode(),
        players: [send, null],
        ready: [false, false],
        inputs: [idleInput(), idleInput()],
        targets: [null, null],
        sim: createInvaders(2),
        timer: null,
        startedAt: 0,
      };
      rooms.set(room.code, room);
      announce(room);
      return { code: room.code, you: 0 };
    },
    join(code: string, send: Send): { code: string; you: number } | null {
      const room = rooms.get(code.toUpperCase());
      if (!room) {
        send({ t: "coop.error", reason: "not-found" });
        return null;
      }
      const you = room.players.indexOf(null);
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
      const { input, target } = cleanInput(raw);
      room.inputs[you] = input;
      room.targets[you] = target;
    },
    leave(code: string, you: number) {
      const room = rooms.get(code);
      if (!room) return;
      room.players[you] = null;
      for (const send of room.players) send?.({ t: "coop.left" });
      close(room);
    },
  };
}
