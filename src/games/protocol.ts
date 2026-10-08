// Messages between the browser and the game server (/ws), shared by both sides. JSON, one object per frame.
import type { InvadersView, ShipInput } from "./invaders-sim.ts";

/** Snake arena: a fixed grid, the same for everyone; clients scale it to their screen. */
export const ARENA_COLS = 64;
export const ARENA_ROWS = 40;
export const ARENA_TICK_MS = 110;
/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_STEP: Record<Dir, readonly [number, number]> = {
  0: [0, -1],
  1: [1, 0],
  2: [0, 1],
  3: [-1, 0],
};

/** One snake in an arena snapshot. `body` is flat [x0, y0, x1, y1, …], head first. */
export interface ArenaSnake {
  id: number;
  name: string;
  bot: boolean;
  body: number[];
  alive: boolean;
  score: number;
  /**
   * Where it is heading, cells still to grow, and the last turn (`seq`) the server has used: what the
   * owner's browser needs to predict its own snake ahead of the snapshots.
   */
  dir: Dir;
  grow: number;
  ack: number;
}

export interface ArenaState {
  /** Server tick this snapshot was taken at: one every ARENA_TICK_MS. */
  tick: number;
  snakes: ArenaSnake[];
  /** Flat [x, y, …]. */
  food: number[];
  /** A super grain: [x, y, ms left], or null. */
  superFood: [number, number, number] | null;
  /** Top five of the moment: [name, score]. */
  top: [string, number][];
  /** Humans connected right now. */
  online: number;
}

/**
 * Co-op input: the browser moves its own ship (so it answers at once) and reports where it is; the server
 * follows that position at a capped speed. `fire` is the button (or a finger on the screen).
 */
export interface CoopInput {
  x: number;
  fire: boolean;
  /**
   * The ship's speed right now and the measured round trip: the server uses them to place the ship where
   * it really is on the player's screen when a bomb arrives, not where the last report left it.
   */
  vx?: number;
  rtt?: number;
}

export type ClientMessage =
  /** Round-trip time: the server answers `pong` with the same `n` right away. */
  | { t: "ping"; n: number }
  /** `resume`: the token from a previous welcome, to take the same snake back after a dropped connection. */
  | { t: "arena.join"; name: string; resume?: string }
  /** A turn, numbered, meant for server tick `at` (what the browser showed when it was pressed). */
  | { t: "arena.dir"; dir: Dir; seq: number; at: number }
  | { t: "coop.create" }
  /** `resume`: the token from `coop.room`, to take the same seat back after a dropped connection. */
  | { t: "coop.join"; room: string; resume?: string }
  | { t: "coop.ready" }
  | { t: "coop.input"; input: CoopInput | ShipInput };

export type ServerMessage =
  | { t: "pong"; n: number }
  | { t: "arena.welcome"; you: number; name: string; token: string }
  | { t: "arena.state"; state: ArenaState }
  | { t: "arena.full" }
  | {
      t: "coop.room";
      room: string;
      you: number;
      players: number;
      token: string;
    }
  /** The other player's connection dropped: the game waits for them (up to a few seconds). */
  | { t: "coop.away" }
  | { t: "coop.back" }
  | { t: "coop.start" }
  | { t: "coop.state"; view: InvadersView }
  | { t: "coop.left" }
  | { t: "coop.error"; reason: "full" | "not-found" };

/** How long a dropped player's snake or co-op seat is kept for them to come back. */
export const RESUME_MS = 15_000;

/** Room codes: 4 letters without the easily confused ones (I, L, O). */
export const ROOM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ";
export const isRoomCode = (s: string) =>
  /^[A-HJKMNP-Z]{4}$/.test(s.toUpperCase());

/** Player names: up to 12 letters, digits, "-" or "_"; anything else is dropped. */
export const cleanName = (raw: string) =>
  [...raw.normalize("NFC")]
    .filter((c) => /[\p{L}\p{N}_-]/u.test(c))
    .join("")
    .slice(0, 12);
