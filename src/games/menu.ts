// A game's start screen: the game's name and its modes, full screen on black like the games themselves.
// ↑ ↓ (or W S) move, Enter or a click picks, Esc goes back to the terminal. A mode can ask for a short
// text first (a nickname, a room code): picking it shows the field, Enter confirms.
import { gameLayer } from "../back.ts";

export interface MenuOption {
  label: string;
  hint: string;
  /** Asks for a text before starting; `required` refuses an empty one, `valid` checks it. */
  input?: {
    placeholder: string;
    /** What the field starts with (the nickname used last time). */
    value?: string;
    maxLength: number;
    required?: boolean;
    valid?: (value: string) => boolean;
    invalid?: string;
  };
  start(value: string): void;
}

export interface MenuTexts {
  keys: string;
  exit: string;
}

export function openGameMenu(
  title: string,
  options: MenuOption[],
  texts: MenuTexts,
  onExit: () => void,
) {
  const overlay = document.createElement("div");
  overlay.className = "game game-menu";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", title);

  const panel = document.createElement("div");
  panel.className = "game-menu-panel";
  const heading = document.createElement("p");
  heading.className = "game-menu-title";
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "game-menu-list";
  list.setAttribute("role", "listbox");
  const keys = document.createElement("p");
  keys.className = "game-menu-keys";
  keys.textContent = texts.keys;

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "game-exit";
  exit.textContent = `✕ ${texts.exit}`;

  let selected = 0;
  /** The option whose text field is open, if any. */
  let asking: {
    option: MenuOption;
    field: HTMLInputElement;
    error: HTMLElement;
  } | null = null;

  const rows = options.map((option, i) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "game-menu-option";
    row.setAttribute("role", "option");
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = option.label;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = option.hint;
    row.append(label, hint);
    row.addEventListener("click", () => {
      select(i);
      pick();
    });
    row.addEventListener("mouseenter", () => !asking && select(i));
    list.append(row);
    return row;
  });

  panel.append(heading, list, keys);
  overlay.append(panel, exit);
  document.body.append(overlay);
  (document.activeElement as HTMLElement | null)?.blur();

  function select(i: number) {
    selected = (i + options.length) % options.length;
    rows.forEach((row, k) =>
      row.setAttribute("aria-selected", String(k === selected)),
    );
  }
  select(0);

  function close() {
    removeEventListener("keydown", onKey, true);
    overlay.remove();
  }

  /** Back to the terminal from inside (Esc, ✕): the history entry goes back too. */
  function leave() {
    close();
    gameLayer.leave();
    onExit();
  }

  function begin(option: MenuOption, value: string) {
    close();
    // The game takes over this screen's history entry, so Back closes the game.
    gameLayer.handoff();
    option.start(value);
  }

  function pick() {
    const option = options[selected];
    if (!option.input) return begin(option, "");
    if (asking?.option === option) return confirm();
    asking?.field.parentElement?.remove();
    // The field opens under the option; the other rows stay clickable to change your mind.
    const wrap = document.createElement("div");
    wrap.className = "game-menu-input";
    const field = document.createElement("input");
    field.type = "text";
    field.placeholder = option.input.placeholder;
    field.value = option.input.value ?? "";
    field.maxLength = option.input.maxLength;
    field.autocapitalize = "off";
    field.spellcheck = false;
    field.setAttribute("autocomplete", "off");
    field.setAttribute("aria-label", option.input.placeholder);
    const error = document.createElement("span");
    error.className = "error";
    wrap.append(field, error);
    rows[selected].after(wrap);
    asking = { option, field, error };
    field.focus();
  }

  function confirm() {
    if (!asking) return;
    const { option, field, error } = asking;
    const value = field.value.trim();
    const spec = option.input!;
    if (
      (spec.required && !value) ||
      (value && spec.valid && !spec.valid(value))
    ) {
      error.textContent = spec.invalid ?? "";
      field.focus();
      return;
    }
    begin(option, value);
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = asking && document.activeElement === asking.field;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      // Esc closes an open field first, then leaves.
      if (asking) {
        asking.field.parentElement?.remove();
        asking = null;
        return;
      }
      leave();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      return typing ? confirm() : pick();
    }
    if (typing) return;
    const up = e.key === "ArrowUp" || e.key === "w" || e.key === "W";
    const down = e.key === "ArrowDown" || e.key === "s" || e.key === "S";
    if (up || down) {
      e.preventDefault();
      e.stopPropagation();
      select(selected + (down ? 1 : -1));
    }
  }

  addEventListener("keydown", onKey, true);
  exit.addEventListener("click", leave);
  // The phone's Back closes the start screen.
  gameLayer.enter(() => {
    close();
    onExit();
  });
}
