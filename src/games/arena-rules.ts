// The arena's rules that the server and the browser must agree on exactly, so the browser can play your
// snake forward and land where the server will: how fast a snake moves, and how a power-up changes it.
import { ARENA_TICK_MS } from "./protocol.ts";

/** How long the red (faster) and green (shield) power-ups last, in beats: 5 seconds. */
export const POWER_TICKS = 5000 / ARENA_TICK_MS;
/** The red power-up's speed-up. */
export const BOOST = 1.2;

/**
 * Milliseconds per step: the shorter the snake, the faster. A newborn snake (4 to 6 cells) steps every
 * 80 ms; it slows down as it grows, to every 200 ms at 60 cells and beyond.
 */
export function moveInterval(length: number, boosted: boolean): number {
  const t = Math.max(0, Math.min(1, (length - 6) / 54));
  return (80 + 120 * t) / (boosted ? BOOST : 1);
}

/** Move credit gathered each beat; a snake steps one cell per whole credit. */
export const creditPerTick = (length: number, boosted: boolean) =>
  ARENA_TICK_MS / moveInterval(length, boosted);
