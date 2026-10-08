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
  sim: ReturnType<typeof createInvaders>;
  timer: ReturnType<typeof setInterval> | null;
  startedAt: number;
}

const STEP_MS = 16;
/** Snapshots go out every other step: about 30 per second. */
const SEND_EVERY = 2;
const MAX_ROOMS = 200;

/** Accepts only a well-formed input; anything else counts as "nothing pressed". */
function cleanInput(raw: unknown): ShipInput {
  const r = (raw ?? {}) as Record<string, unknown>;
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
      if (room) room.inputs[you] = cleanInput(raw);
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
