import {
  complete,
  normalize,
  resolve,
  translateCommand,
  type Ctx,
  type Theme,
} from "./commands.ts";
import type { Lang } from "./content.ts";
import { cmd, h, join, type Child } from "./dom.ts";
import { ui } from "./i18n.ts";

interface Hooks {
  setLang(lang: Lang): void;
  setTheme(theme: Theme): void;
  showSimple(): void;
  onCommand(id: string): void;
  /** The screen was cleared: nothing is open any more. */
  onClear(): void;
  /** Back to the welcome screen. */
  home(): void;
}

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The pieces of a block that appear one at a time when output streams in. */
const UNITS = "p, li, dt, dd, pre, figure, svg.banner, .project-logo, .tile";

/** Short lines appear quickly, longer ones get a beat more so the eye can follow. */
const pace = (el: Element) =>
  reducedMotion
    ? 0
    : Math.min(70 + (el.textContent?.length ?? 0) * 1.2, 240) +
      (el.matches(".title, svg") ? 140 : 0);

export class Terminal {
  readonly history: string[] = [];
  /** Incremented on every typed command so a newer click cancels one still being typed. */
  private typing = 0;
  private mirror: {
    root: HTMLElement;
    before: HTMLElement;
    cursor: HTMLElement;
    after: HTMLElement;
  };
  /** Position while browsing history with the arrow keys; equals history.length when not browsing. */
  private cursor = 0;
  private draft = "";
  /** Full command suggested inline (fish-style), or "" when there is no single match. */
  private suggestion = "";

  // Streaming output: units waiting to be shown.
  private queue: Element[] = [];
  /**
   * What is on screen since the last clear, so it can be redrawn in another language: commands as typed,
   * and render functions for blocks printed outside a command (boot lines, welcome).
   */
  private transcript: (string | (() => void))[] = [];
  private replaying = false;
  private streaming = false;

  constructor(
    public lang: Lang,
    private screen: HTMLElement,
    private out: HTMLElement,
    private input: HTMLInputElement,
    private hooks: Hooks,
  ) {
    input.addEventListener("keydown", (e) => this.onKey(e));

    // Block cursor: the real input is transparent and a mirror draws text + cursor.
    const root = input.parentElement!.querySelector<HTMLElement>(".mirror")!;
    this.mirror = {
      root,
      before: root.querySelector(".before")!,
      cursor: root.querySelector(".cursor")!,
      after: root.querySelector(".after")!,
    };
    const sync = () => this.syncCursor();
    for (const ev of ["input", "keyup", "click", "focus", "blur", "select"])
      input.addEventListener(ev, sync);
    input.addEventListener("keydown", () => requestAnimationFrame(sync));
    document.addEventListener(
      "selectionchange",
      () => document.activeElement === input && sync(),
    );
    input.form?.addEventListener("submit", (e) => {
      e.preventDefault();
      // Enter accepts the inline suggestion when what was typed isn't a command on its own.
      const typed = input.value;
      const value =
        this.suggestion && !resolve(typed.trim()) ? this.suggestion : typed;
      input.value = "";
      this.syncCursor();
      this.run(value);
    });
    // Clickable commands anywhere in the output.
    out.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-cmd]");
      if (!btn) return;
      this.type(btn.dataset.cmd!);
    });
    // Clicking empty terminal space focuses the prompt, unless the user is selecting text.
    screen.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a, button")) return;
      if (!window.getSelection()?.toString()) this.focus();
    });
  }

  get t() {
    return ui[this.lang];
  }

  get prompt() {
    return `${this.t.user}@phas.dev:~$`;
  }

  syncCursor() {
    const { value, selectionStart, selectionEnd } = this.input;
    const at = selectionStart ?? value.length;
    const { root, before, cursor, after } = this.mirror;

    // Inline suggestion: with the caret at the end of a lone command name that has exactly
    // one completion, the rest of it is drawn muted after the cursor.
    const matches =
      at === value.length && value ? complete(value, this.lang) : [];
    const typed = normalize(value);
    this.suggestion =
      matches.length === 1 &&
      matches[0] !== typed &&
      matches[0].startsWith(typed)
        ? matches[0]
        : "";
    const ghost = this.suggestion.slice(value.length);

    before.textContent = value.slice(0, at);
    // The cursor covers the character under it (or the first suggested one), else a blank.
    cursor.textContent = value[at] ?? ghost[0] ?? " ";
    cursor.classList.toggle("ghost", !value[at] && !!ghost);
    after.textContent = value[at] ? value.slice(at + 1) : ghost.slice(1);
    after.classList.toggle("ghost", !value[at] && !!ghost);
    cursor.hidden = selectionStart !== selectionEnd;
    root.style.transform = `translateX(${-this.input.scrollLeft}px)`;
    // Restart the blink so the cursor is solid right after each keystroke.
    cursor.style.animation = "none";
    void cursor.offsetWidth;
    cursor.style.animation = "";
  }

  /** Types a command into the prompt, then runs it. Clicking shows that chips are just commands. */
  async type(command: string) {
    this.focus();
    if (reducedMotion) return this.run(command);
    const id = ++this.typing;
    const input = this.input;
    for (let i = 1; i <= command.length; i++) {
      input.value = command.slice(0, i);
      input.setSelectionRange(i, i);
      this.syncCursor();
      await sleep(i === 1 ? 40 : 24);
      if (id !== this.typing) return;
    }
    await sleep(90);
    if (id !== this.typing) return;
    input.value = "";
    this.syncCursor();
    this.run(command);
  }

  focus() {
    this.input.focus({ preventScroll: true });
  }

  /** Prints a block that streams in line by line. */
  print(...children: Child[]) {
    const block = h("div", { class: "block" }, ...children);
    const units = [...block.querySelectorAll(UNITS)];
    for (const u of units) u.classList.add("pending");
    this.out.append(block);
    this.queue.push(...units);
    this.pump();
  }

  /** Prints immediately, after anything still streaming (prompt echoes, status lines). */
  printNow(...children: Child[]) {
    this.flush();
    this.out.append(h("div", { class: "block" }, ...children));
    this.scrollToEnd();
  }

  /** Shows everything still queued at once (Esc, or when a new command runs). */
  flush() {
    for (const u of this.queue) this.reveal(u);
    this.queue = [];
    this.scrollToEnd();
  }

  /** Empties the screen, prompt echo included, and leaves only the bar and the prompt at the top. */
  clear() {
    this.queue = [];
    this.transcript = [];
    this.out.replaceChildren();
    this.screen.scrollTop = 0;
    this.hooks.onClear();
  }

  /** Records a block printed outside a command, with how to print it again. */
  remember(render: () => void) {
    this.transcript.push(render);
  }

  /** Redraws everything on screen in the current language, at once, without repeating side effects. */
  relocalize() {
    const items = this.transcript;
    this.queue = [];
    this.transcript = [];
    this.out.replaceChildren();
    this.replaying = true;
    try {
      for (const item of items) {
        if (typeof item === "string") this.run(translateCommand(item, this.lang));
        else {
          item();
          this.transcript.push(item);
        }
      }
    } finally {
      this.replaying = false;
    }
    this.flush();
  }

  private scrollToEnd() {
    this.screen.scrollTop = this.screen.scrollHeight;
  }

  /** True when the reader is at (or near) the latest output, so new lines may pull the view down. */
  private atBottom() {
    const s = this.screen;
    return s.scrollTop + s.clientHeight >= s.scrollHeight - 48;
  }

  /** Scrolls the output by a few lines (arrows) or a page. */
  private scrollBy(lines: number) {
    const lineHeight =
      parseFloat(getComputedStyle(this.screen).lineHeight) || 24;
    this.screen.scrollBy({
      top: lines * lineHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }

  private reveal(u: Element) {
    u.classList.remove("pending");
    u.classList.add("revealed");
  }

  private async pump() {
    if (this.streaming) return;
    this.streaming = true;
    while (this.queue.length) {
      const unit = this.queue.shift()!;
      const follow = this.atBottom();
      this.reveal(unit);
      if (follow) this.scrollToEnd();
      const delay = this.queue.length ? pace(unit) : 0;
      if (delay) await sleep(delay);
    }
    this.streaming = false;
  }

  run(raw: string, echo = true) {
    const input = raw.trim();
    // A command typed while redrawing must not redraw again (`lang en` itself is in the transcript).
    if (!this.replaying) this.flush();
    if (echo) {
      this.echo(raw);
      this.transcript.push(raw);
    }
    if (!input) return;
    if (!this.replaying && this.history.at(-1) !== input) this.history.push(input);
    this.cursor = this.history.length;

    const [name, ...args] = input.split(/\s+/);
    const command = resolve(name);
    if (!command)
      return this.print(
        h("p", null, this.t.notFound(name)),
        h("p", { class: "muted" }, this.t.tryHelp),
      );
    command.run(args, this.ctx());
    this.hooks.onCommand(command.id);
  }

  private echo(text: string, suffix = "") {
    this.printNow(
      h(
        "p",
        { class: "echo" },
        h("span", { class: "prompt" }, this.prompt),
        " ",
        text,
        suffix,
      ),
    );
  }

  private ctx(): Ctx {
    return {
      lang: this.lang,
      t: this.t,
      history: this.history,
      print: (...c) => this.print(...c),
      clear: () => this.clear(),
      // While redrawing, the switches only print what they printed the first time.
      home: () => !this.replaying && this.hooks.home(),
      setLang: (l) => (this.replaying ? this.print(h("p", { class: "muted" }, ui[l].langSet)) : this.hooks.setLang(l)),
      setTheme: (t) => !this.replaying && this.hooks.setTheme(t),
      showSimple: () => !this.replaying && this.hooks.showSimple(),
      run: (i) => this.run(i),
      focus: () => this.focus(),
      replaying: this.replaying,
    };
  }

  private onKey(e: KeyboardEvent) {
    const input = this.input;
    // Any real keystroke wins over a command still being auto-typed.
    this.typing++;

    // Reading: while output streams, the arrows scroll it; otherwise they browse history.
    // Shift+arrows and PageUp/PageDown always scroll.
    const reading = !input.value && this.queue.length > 0;
    const arrow = e.key === "ArrowUp" || e.key === "ArrowDown";
    if (
      (arrow && (reading || e.shiftKey)) ||
      e.key === "PageUp" ||
      e.key === "PageDown"
    ) {
      e.preventDefault();
      const down = e.key === "ArrowDown" || e.key === "PageDown";
      const page = Math.max(3, Math.floor(this.screen.clientHeight / 24) - 2);
      this.scrollBy((e.key.startsWith("Page") ? page : 3) * (down ? 1 : -1));
      return;
    }
    // Esc shows everything still streaming.
    if (e.key === "Escape" && this.queue.length) {
      e.preventDefault();
      this.flush();
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!this.history.length) return;
      e.preventDefault();
      if (this.cursor === this.history.length) this.draft = input.value;
      this.cursor = Math.max(
        0,
        Math.min(
          this.history.length,
          this.cursor + (e.key === "ArrowUp" ? -1 : 1),
        ),
      );
      input.value =
        this.cursor === this.history.length
          ? this.draft
          : this.history[this.cursor];
      requestAnimationFrame(() =>
        input.setSelectionRange(input.value.length, input.value.length),
      );
      return;
    }

    if (
      e.key === "ArrowRight" &&
      this.suggestion &&
      input.selectionStart === input.value.length
    ) {
      e.preventDefault();
      input.value = `${this.suggestion} `;
      return;
    }

    if (e.key === "Tab") {
      // Only the command name is completed; arguments are left alone.
      if (!input.value) return;
      e.preventDefault();
      const matches = complete(input.value, this.lang);
      if (matches.length === 1) input.value = `${matches[0]} `;
      else if (matches.length > 1) {
        this.echo(input.value);
        this.print(
          h(
            "p",
            null,
            ...join(
              matches.map((m) => cmd(m)),
              "  ",
            ),
          ),
        );
      }
      return;
    }

    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      this.clear();
      return;
    }

    // Let Ctrl+C copy when there is a selection inside the prompt.
    if (
      e.ctrlKey &&
      e.key.toLowerCase() === "c" &&
      input.selectionStart !== input.selectionEnd
    )
      return;
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      this.echo(input.value, "^C");
      input.value = "";
      this.cursor = this.history.length;
    }
  }
}
