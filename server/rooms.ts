// Two-player rooms for the versus games (Pong, Tetris): a 4-letter code to share, a token per seat to take
// it back after a dropped connection, and a grace period (RESUME_MS) before the other player is told the
// room is gone. The game itself plugs in through `start`, `input` and `stop`.
import { randomUUID } from "node:crypto";
import { RESUME_MS, ROOM_ALPHABET } from "../src/games/protocol.ts";

export type Send<M> = (msg: M) => void;

export interface Room<M, G> {
  code: string;
  players: (Send<M> | null)[];
  tokens: string[];
  /** When each seat's connection dropped; null while connected. */
  away: (number | null)[];
  ready: boolean[];
  /** The game running in the room, once both are in and ready. */
  game: G | null;
  /**
   * In the lobby: listed among the open rooms and taken by the next player who looks for a match (rooms
   * from "find a match", and the ones their creator chose to list).
   */
  open?: boolean;
  /** When the room was created (ms, Date.now()), for how long it has been waiting. */
  since: number;
  expiry: ReturnType<typeof setTimeout> | null;
}

/** The messages a room sends, named for each game ("pong.room", "tetris.away"…). */
export interface RoomMessages<M> {
  room(code: string, you: number, players: number, token: string): M;
  away(): M;
  back(): M;
  left(): M;
  error(reason: "full" | "not-found"): M;
}

export interface GameHooks<M, G> {
  /** Both players are in and ready: start the game. */
  start(room: Room<M, G>): G;
  /** Called when the room closes. */
  stop(game: G): void;
  /** A seat came back after a dropped connection (resend what it needs). */
  resumed?(room: Room<M, G>, seat: number): void;
}

const MAX_ROOMS = 200;

export function createRooms<M, G>(
  messages: RoomMessages<M>,
  hooks: GameHooks<M, G>,
) {
  const rooms = new Map<string, Room<M, G>>();

  const newCode = () => {
    for (;;) {
      const code = Array.from(
        { length: 4 },
        () => ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)],
      ).join("");
      if (!rooms.has(code)) return code;
    }
  };

  const announce = (room: Room<M, G>) =>
    room.players.forEach((send, you) =>
      send?.(
        messages.room(
          room.code,
          you,
          room.players.filter(Boolean).length,
          room.tokens[you],
        ),
      ),
    );

  function close(room: Room<M, G>) {
    if (room.game) hooks.stop(room.game);
    if (room.expiry) clearTimeout(room.expiry);
    rooms.delete(room.code);
  }

  function maybeStart(room: Room<M, G>) {
    if (room.game || !room.players.every(Boolean) || !room.ready.every(Boolean))
      return;
    room.game = hooks.start(room);
  }

  const waitingInLobby = (r: Room<M, G>) =>
    !!r.open &&
    !r.game &&
    r.away.every((a) => a === null) &&
    r.players.filter(Boolean).length === 1;

  const api = {
    get: (code: string) => rooms.get(code),
    /** True while a seat of the room is reconnecting: the game should hold still. */
    paused: (room: Room<M, G>) => room.away.some((a) => a !== null),
    create(
      send: Send<M>,
      listed = false,
    ): { code: string; you: number } | null {
      if (rooms.size >= MAX_ROOMS) return null;
      const room: Room<M, G> = {
        code: newCode(),
        open: listed,
        since: Date.now(),
        players: [send, null],
        tokens: [randomUUID(), randomUUID()],
        away: [null, null],
        ready: [false, false],
        game: null,
        expiry: null,
      };
      rooms.set(room.code, room);
      announce(room);
      return { code: room.code, you: 0 };
    },
    /** Takes the free seat, or, with a seat's token, takes that seat back after a dropped connection. */
    join(
      code: string,
      send: Send<M>,
      resume?: string,
    ): { code: string; you: number } | null {
      const room = rooms.get(code.toUpperCase());
      if (!room) {
        send(messages.error("not-found"));
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
        hooks.resumed?.(room, back);
        room.players.forEach((p, i) => i !== back && p?.(messages.back()));
        return { code: room.code, you: back };
      }
      const you = room.players.findIndex(
        (p, i) => p === null && room.away[i] === null,
      );
      if (you < 0) {
        send(messages.error("full"));
        return null;
      }
      room.players[you] = send;
      announce(room);
      maybeStart(room);
      return { code: room.code, you };
    },
    ready(code: string, you: number) {
      const room = rooms.get(code);
      if (!room) return;
      room.ready[you] = true;
      maybeStart(room);
    },
    /** A connection dropped: the seat waits RESUME_MS for its player; then the room closes. */
    leave(code: string, you: number) {
      const room = rooms.get(code);
      if (!room) return;
      room.players[you] = null;
      room.away[you] = Date.now();
      if (room.players.every((p) => p === null)) {
        close(room);
        return;
      }
      room.players.forEach((p, i) => i !== you && p?.(messages.away()));
      if (room.expiry) clearTimeout(room.expiry);
      room.expiry = setTimeout(() => {
        for (const send of room.players) send?.(messages.left());
        close(room);
      }, RESUME_MS);
    },
    /**
     * The lobby: the free seat in a room someone opened the same way and is waiting in (the longest
     * waiting first), or a new room to wait in for the next one.
     */
    quick(send: Send<M>): { code: string; you: number } | null {
      const waiting = [...rooms.values()].find(waitingInLobby);
      if (waiting) return api.join(waiting.code, send);
      return api.create(send, true);
    },
    /** The lobby: open rooms with someone waiting in them, the longest waiting first. */
    list: () =>
      [...rooms.values()]
        .filter(waitingInLobby)
        .map((r) => ({ code: r.code, waiting: Date.now() - r.since })),
    /** Sends to both seats. */
    broadcast(room: Room<M, G>, msg: M) {
      for (const send of room.players) send?.(msg);
    },
    close,
  };
  return api;
}
