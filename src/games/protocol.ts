// Messages between the browser and the game server (/ws), shared by both sides. JSON, one object per frame.
import type { InvadersView, ShipInput } from "./invaders-sim.ts";
import type { VersusView } from "./invaders-versus-sim.ts";
import type { PongView } from "./pong-sim.ts";

/** Snake arena: a fixed grid, the same for everyone; clients scale it to their screen. */
export const ARENA_COLS = 64;
export const ARENA_ROWS = 40;
/**
 * The arena's beat. Snakes do not move every beat: each one gathers "move credit" every beat, faster the
 * shorter it is (arena-rules.ts), and steps a cell whenever it has a whole one. Snapshots go out every
 * other beat.
 */
export const ARENA_TICK_MS = 20;
export const ARENA_SEND_EVERY = 2;
/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_STEP: Record<Dir, readonly [number, number]> = {
  0: [0, -1],
  1: [1, 0],
  2: [0, 1],
  3: [-1, 0],
};

/** Power-ups on the field: the white super grain (points, grows by three), red (faster), green (shield). */
export const POWER_KINDS = ["super", "speed", "shield"] as const;
export type PowerKind = (typeof POWER_KINDS)[number];

/** One snake in an arena snapshot. `body` is flat [x0, y0, x1, y1, …], head first. */
export interface ArenaSnake {
  id: number;
  name: string;
  bot: boolean;
  body: number[];
  alive: boolean;
  score: number;
  /**
   * Where it is heading, cells still to grow, the last turn (`seq`) the server has used, its move credit
   * and the beat of its last step, and its power-ups' beats left: what a browser needs to play the snake
   * forward exactly as the server will.
   */
  dir: Dir;
  grow: number;
  ack: number;
  credit: number;
  movedAt: number;
  /** The cell its tail left on the last step, [x, y] (null if it grew instead): for the smooth drawing. */
  prevTail: [number, number] | null;
  boost: number;
  shield: number;
}

export interface ArenaState {
  /** Server beat this snapshot was taken at: one every ARENA_TICK_MS. */
  tick: number;
  snakes: ArenaSnake[];
  /** Flat [x, y, …]. */
  food: number[];
  /** Power-ups: [x, y, kind (index in POWER_KINDS), beats left]. */
  powers: [number, number, number, number][];
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
  /** How fast the ship is going here (0 the moment it stops): the server reckons with it between reports. */
  vx?: number;
  fire: boolean;
  /** The measured round trip: with it the server places the ship where it is on the player's screen. */
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
  | { t: "coop.input"; input: CoopInput | ShipInput }
  /**
   * A volley (or the special) fired in the browser: from `x`, at server game time `at` (the page's
   * estimate). The server fires it from there and lets it catch up, so it flies where it was seen.
   */
  | { t: "coop.shoot"; x: number; at: number; special?: boolean }
  // Pong 1v1: the paddle's centre (moved in the browser, followed by the server) and the round trip.
  | { t: "pong.create" }
  | { t: "pong.join"; room: string; resume?: string }
  | { t: "pong.ready" }
  | { t: "pong.input"; y: number; vy?: number; rtt?: number }
  | { t: "pong.again" }
  // Space Invaders versus: the same room flow; the ship is reported like in co-op.
  | { t: "invaders.create" }
  | { t: "invaders.join"; room: string; resume?: string }
  | { t: "invaders.ready" }
  | { t: "invaders.input"; input: CoopInput }
  | { t: "invaders.shoot"; x: number; at: number; special?: boolean }
  | { t: "invaders.again" }
  // Tetris versus: each browser runs its own game; the server passes boards and attacks along.
  | { t: "tetris.create" }
  | { t: "tetris.join"; room: string; resume?: string }
  | { t: "tetris.ready" }
  /** The visible well (200 digits) and the score, a few times a second, for the other player's view. */
  | { t: "tetris.board"; cells: string; score: number; lines: number }
  /** Garbage lines for the other player (from clearing 2 or more lines at once). */
  | { t: "tetris.attack"; lines: number }
  | { t: "tetris.over" }
  | { t: "tetris.again" };

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
  | { t: "coop.error"; reason: "full" | "not-found" }
  | {
      t: "pong.room";
      room: string;
      you: number;
      players: number;
      token: string;
    }
  | { t: "pong.start" }
  | { t: "pong.state"; view: PongView }
  | { t: "pong.away" }
  | { t: "pong.back" }
  | { t: "pong.left" }
  | { t: "pong.error"; reason: "full" | "not-found" }
  | {
      t: "invaders.room";
      room: string;
      you: number;
      players: number;
      token: string;
    }
  | { t: "invaders.start" }
  | { t: "invaders.state"; view: VersusView }
  | { t: "invaders.away" }
  | { t: "invaders.back" }
  | { t: "invaders.left" }
  | { t: "invaders.error"; reason: "full" | "not-found" }
  | {
      t: "tetris.room";
      room: string;
      you: number;
      players: number;
      token: string;
    }
  /** A match begins: both games use this seed, so both get the same pieces. */
  | { t: "tetris.start"; seed: number }
  | { t: "tetris.opponent"; cells: string; score: number; lines: number }
  | { t: "tetris.garbage"; lines: number; hole: number }
  | { t: "tetris.result"; won: boolean }
  | { t: "tetris.away" }
  | { t: "tetris.back" }
  | { t: "tetris.left" }
  | { t: "tetris.error"; reason: "full" | "not-found" };

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
