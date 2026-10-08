// The frame every game runs in: a full-screen black overlay with one canvas, an always-visible exit
// button, and a short tutorial that holds the game until the first key or tap. Esc pauses (and resumes);
// on the pause panel Q or "Sair" leaves. Game time stops while paused, so timed power-ups wait too.

export interface GameTexts {
  title: string;
  /** How to play, one short line each. */
  help: string[];
  start: string;
  exit: string;
  paused: string;
  resume: string;
}

export interface Shell {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  /** The theme accent, read once when the game opens. */
  accent: string;
  width: number;
  height: number;
  started: boolean;
  /** True while the pause panel is up: games must not advance. */
  paused: boolean;
  /** Game time: performance.now() minus the time spent paused. */
  now(): number;
  /** Runs `step(dt)` and `draw(now)` every frame until the game closes; `now` is game time. */
  loop(frame: (now: number, dt: number) => void): void;
  close(): void;
}

interface Options {
  texts: GameTexts;
  /** Online games keep running on the server: leaving the tab doesn't pause, and Esc is just a menu. */
  live?: boolean;
  onKey(key: string, down: boolean, e: KeyboardEvent): void;
  onResize?(): void;
  onStart?(): void;
  onExit(): void;
  /** Touch on the play area (after the tutorial): position and phase. */
  onTouch?(x: number, y: number, phase: "start" | "move" | "end"): void;
}

export function openGame(options: Options): Shell {
  const { texts } = options;
  const overlay = document.createElement("div");
  overlay.className = "game";
  overlay.setAttribute("role", "application");
  overlay.setAttribute("aria-label", texts.title);

  const canvas = document.createElement("canvas");
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "game-exit";
  exit.textContent = `✕ ${texts.exit}`;
  exit.setAttribute("aria-label", texts.exit);

  const help = document.createElement("div");
  help.className = "game-help";
  const title = document.createElement("p");
  title.className = "game-title";
  title.textContent = texts.title;
  const list = document.createElement("ul");
  for (const line of texts.help) {
    const li = document.createElement("li");
    li.textContent = line;
    list.append(li);
  }
  const start = document.createElement("p");
  start.className = "game-start";
  start.textContent = texts.start;
  help.append(title, list, start);

  // Pause panel: Continue and Quit, Esc resumes.
  const pause = document.createElement("div");
  pause.className = "game-help game-pause gone";
  const pauseTitle = document.createElement("p");
  pauseTitle.className = "game-title";
  pauseTitle.textContent = texts.paused;
  const actions = document.createElement("div");
  actions.className = "game-actions";
  const resumeBtn = document.createElement("button");
  resumeBtn.type = "button";
  resumeBtn.textContent = `${texts.resume} (Esc)`;
  const quitBtn = document.createElement("button");
  quitBtn.type = "button";
  quitBtn.textContent = `${texts.exit} (Q)`;
  actions.append(resumeBtn, quitBtn);
  pause.append(pauseTitle, actions);

  overlay.append(canvas, help, pause, exit);
  document.body.append(overlay);
  (document.activeElement as HTMLElement | null)?.blur();

  const g = canvas.getContext("2d")!;
  const shell: Shell = {
    canvas,
    g,
    accent:
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim() || "#f0a43a",
    width: 0,
    height: 0,
    started: false,
    paused: false,
    now: () => performance.now() - pausedTotal,
    loop,
    close,
  };
  let pausedTotal = 0;
  let pausedAt = 0;

  function setPaused(on: boolean) {
    if (on === shell.paused || !shell.started) return;
    shell.paused = on;
    pause.classList.toggle("gone", !on);
    if (on) {
      pausedAt = performance.now();
      resumeBtn.focus({ preventScroll: true });
    } else {
      pausedTotal += performance.now() - pausedAt;
      resumeBtn.blur();
    }
  }

  const resize = () => {
    const dpr = devicePixelRatio || 1;
    shell.width = innerWidth;
    shell.height = innerHeight;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = `${innerWidth}px`;
    canvas.style.height = `${innerHeight}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    options.onResize?.();
  };
  resize();

  const begin = () => {
    if (shell.started) return;
    shell.started = true;
    help.classList.add("gone");
    options.onStart?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (shell.paused) {
      if (key === "q") close();
      else if (key === "Escape" || key === " " || key === "Enter")
        setPaused(false);
      return;
    }
    if (key === "Escape") return shell.started ? setPaused(true) : close();
    begin();
    options.onKey(key, true, e);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    options.onKey(key, false, e);
  };
  const point = (t: Touch) => [t.clientX, t.clientY] as const;
  const onTouchStart = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest(".game-exit")) return;
    if ((e.target as HTMLElement).closest(".game-pause")) return;
    if (!shell.started) return begin();
    options.onTouch?.(...point(e.touches[0]), "start");
  };
  const onTouchMove = (e: TouchEvent) =>
    shell.started &&
    !shell.paused &&
    options.onTouch?.(...point(e.touches[0]), "move");
  const onTouchEnd = (e: TouchEvent) =>
    shell.started && options.onTouch?.(...point(e.changedTouches[0]), "end");
  const onClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest(".game-exit, .game-pause")) begin();
  };

  addEventListener("keydown", onKeyDown, true);
  addEventListener("keyup", onKeyUp, true);
  addEventListener("resize", resize);
  overlay.addEventListener("touchstart", onTouchStart, { passive: true });
  overlay.addEventListener("touchmove", onTouchMove, { passive: true });
  overlay.addEventListener("touchend", onTouchEnd, { passive: true });
  overlay.addEventListener("click", onClick);
  exit.addEventListener("click", () => close());
  resumeBtn.addEventListener("click", () => setPaused(false));
  quitBtn.addEventListener("click", () => close());
  // Leaving the tab pauses the game, like a console.
  const onHidden = () => document.hidden && !options.live && setPaused(true);
  document.addEventListener("visibilitychange", onHidden);

  let raf = 0;
  let closed = false;
  function loop(frame: (now: number, dt: number) => void) {
    let last = performance.now();
    const tick = (now: number) => {
      if (closed) return;
      // Next frame first: an error in this one must not freeze the game, only skip a frame.
      raf = requestAnimationFrame(tick);
      const dt = shell.paused ? 0 : Math.min(now - last, 100);
      last = now;
      try {
        frame(shell.now(), dt);
      } catch (error) {
        console.error(error);
      }
    };
    raf = requestAnimationFrame(tick);
  }

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    removeEventListener("keydown", onKeyDown, true);
    removeEventListener("keyup", onKeyUp, true);
    removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", onHidden);
    overlay.remove();
    options.onExit();
  }

  return shell;
}
