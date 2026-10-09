// A fixed-step loop on the wall clock, for the rooms' simulations (Pong, Space Invaders co-op and versus):
// step n is due at start + n × stepMs, so the game time never drifts from real time the way setInterval
// does (it falls a little behind on every call, and the browsers play the game forward by real time).
// A late timer runs the steps it owes, a few at most; a pause skips the steps instead of owing them.

export function startTicker(
  stepMs: number,
  step: () => void,
  paused: () => boolean = () => false,
) {
  const start = performance.now();
  let done = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const run = () => {
    const due = Math.floor((performance.now() - start) / stepMs);
    for (let n = 0; !stopped && done < due && n < 5; n++, done++)
      if (!paused()) step();
    if (stopped) return;
    if (done < due) done = due;
    timer = setTimeout(
      run,
      Math.max(0, start + (done + 1) * stepMs - performance.now()),
    );
  };
  timer = setTimeout(run, stepMs);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
