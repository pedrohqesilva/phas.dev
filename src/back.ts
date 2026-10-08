// The phone's Back button. A game (its start screen, then the game itself) takes one history entry while
// it is open, so Back closes it instead of leaving the site. Closing it any other way (✕, Esc, Q) gives
// the entry back, so the history doesn't fill with dead steps.

let closer: (() => void) | null = null;
/** True while our entry is the current one. */
let entry = false;
/** Pops we caused ourselves (giving an entry back), which the popstate handler must ignore. */
let ownPops = 0;

export const gameLayer = {
  /** A game screen opened; reuses the entry when the start screen hands over to the game. */
  enter(close: () => void) {
    closer = close;
    if (!entry) {
      history.pushState({ layer: "game" }, "");
      entry = true;
    }
  },
  /** The start screen closes to open a game: keep the entry for it. */
  handoff() {
    closer = null;
  },
  /** Closed from inside (✕, Esc, Q): give the entry back. */
  leave() {
    closer = null;
    if (!entry) return;
    entry = false;
    ownPops++;
    history.back();
  },
};

/** Called first on every popstate; true when it was ours (a game closed by Back, or our own pop). */
export function handleBack(): boolean {
  if (ownPops) {
    ownPops--;
    return true;
  }
  if (!entry) return false;
  entry = false;
  const close = closer;
  closer = null;
  close?.();
  return true;
}
