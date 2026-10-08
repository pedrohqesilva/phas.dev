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
}

export interface ArenaState {
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

export type ClientMessage =
  | { t: "arena.join"; name: string }
  | { t: "arena.dir"; dir: Dir }
  | { t: "coop.create" }
  | { t: "coop.join"; room: string }
  | { t: "coop.ready" }
  | { t: "coop.input"; input: ShipInput };

export type ServerMessage =
  | { t: "arena.welcome"; you: number; name: string }
  | { t: "arena.state"; state: ArenaState }
  | { t: "arena.full" }
  | { t: "coop.room"; room: string; you: number; players: number }
  | { t: "coop.start" }
  | { t: "coop.state"; view: InvadersView }
  | { t: "coop.left" }
  | { t: "coop.error"; reason: "full" | "not-found" };

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
