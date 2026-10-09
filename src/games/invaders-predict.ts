// What the online Space Invaders (co-op and versus) draws ahead of the server, so a shot that hits on
// screen looks like a hit at once: the march played forward to now, and the hits seen here before the
// server confirms them.
import { COLS, marchStep } from "./invaders-sim.ts";

interface Grid {
  gridX: number;
  gridY?: number;
  march: number;
  marchIn: number;
  marchEvery: number;
  animFrame: number;
  hp: number[];
}

/** The grid `ms` after the snapshot: the march steps due by then (`drop`: down at an edge, or 0). */
export function gridAfter(v: Grid, ms: number, drop: number) {
  const g = {
    gridX: v.gridX,
    gridY: v.gridY ?? 0,
    march: v.march,
    animFrame: v.animFrame,
  };
  const cols = [...new Set(v.hp.flatMap((hp, k) => (hp ? [k % COLS] : [])))];
  if (!cols.length || !(v.marchEvery > 0)) return g;
  for (let t = v.marchIn, n = 0; t <= ms && n < 12; t += v.marchEvery, n++)
    marchStep(g, cols, drop);
  return g;
}

/**
 * Hits seen here and not yet in a snapshot. Each lowers an invader's hits until the server's own count
 * for it changes (it agreed) or a round trip and a bit passes (it did not: the invader is back).
 */
export function pendingHits() {
  const hits = new Map<number, { hp: number; minus: number; until: number }>();
  return {
    add(slot: number, serverHp: number, minus: number, until: number) {
      const h = hits.get(slot);
      if (h && h.hp === serverHp) {
        h.minus += minus;
        h.until = until;
      } else hits.set(slot, { hp: serverHp, minus, until });
    },
    /** The snapshot's hits with the ones seen here taken off. */
    apply(hp: number[], t: number): number[] {
      if (!hits.size) return hp;
      const out = [...hp];
      for (const [slot, h] of hits) {
        if (hp[slot] !== h.hp || t > h.until) {
          hits.delete(slot);
          continue;
        }
        out[slot] = Math.max(0, hp[slot] - h.minus);
      }
      return out;
    },
    clear: () => hits.clear(),
  };
}
