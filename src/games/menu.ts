// A game's start screen: the game's name and its modes (Classic, Co-op, Versus…), full screen on black
// like the games themselves. ↑ ↓ (or W S) move, Enter or a click picks, Esc goes back one level (and from
// the top, to the terminal). A mode can open a second list (Co-op: create a room or join one) or show its
// settings first: a text (nickname, room code) or a choice (← → or a click switch it); Enter starts.
import { gameLayer } from "../back.ts";

export type MenuField =
  | {
      kind: "text";
      key: string;
      placeholder: string;
      /** What the field starts with (the nickname used last time). */
      value?: string;
      maxLength: number;
      /** `required` refuses an empty value, `valid` checks it, `invalid` says what is wrong. */
      required?: boolean;
      valid?: (value: string) => boolean;
      invalid?: string;
    }
  | {
      kind: "choice";
      key: string;
      label: string;
      options: { label: string; value: string }[];
      value?: string;
    };

export interface MenuOption {
  label: string;
  hint: string;
  /** A second list (Co-op → create a room / join one). */
  submenu?: MenuOption[];
  /** Settings shown under the mode before it starts. */
  fields?: MenuField[];
  start?(values: Record<string, string>): void;
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
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "game-menu-title");

  const panel = document.createElement("div");
  panel.className = "game-menu-panel";
  const heading = document.createElement("p");
  heading.className = "game-menu-title";
  heading.id = "game-menu-title";
  // Plain buttons in a labelled group: the highlighted one also has the focus, so a screen reader
  // reads each mode (and its hint) as ↑ ↓ move through them.
  const list = document.createElement("div");
  list.className = "game-menu-list";
  list.setAttribute("role", "group");
  list.setAttribute("aria-labelledby", heading.id);
  const keys = document.createElement("p");
  keys.className = "game-menu-keys";
  keys.textContent = texts.keys;
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "game-exit";
  exit.textContent = `✕ ${texts.exit}`;
  panel.append(heading, list, keys);
  overlay.append(panel, exit);
  document.body.append(overlay);
  (document.activeElement as HTMLElement | null)?.blur();

  /** The lists open, the top one on screen; each remembers its title. */
  const stack: { title: string; options: MenuOption[] }[] = [];
  let rows: HTMLButtonElement[] = [];
  let selected = 0;
  /** The settings form open under an option, if any. */
  let form: {
    option: MenuOption;
    el: HTMLElement;
    values: Record<string, string>;
    controls: {
      field: MenuField;
      el: HTMLElement;
      set?: (dir: number) => void;
    }[];
    focus: number;
    error: HTMLElement;
  } | null = null;

  function show(level: { title: string; options: MenuOption[] }, at = 0) {
    closeForm();
    heading.textContent = level.title;
    list.replaceChildren();
    rows = level.options.map((option, i) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "game-menu-option";
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = option.label + (option.submenu ? " ›" : "");
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = option.hint;
      row.append(label, hint);
      row.addEventListener("click", () => {
        select(i);
        pick();
      });
      row.addEventListener("mouseenter", () => !form && select(i, false));
      row.addEventListener("focus", () => select(i, false));
      list.append(row);
      return row;
    });
    select(at);
  }

  function push(level: { title: string; options: MenuOption[] }) {
    stack.push(level);
    show(level);
  }

  function select(i: number, focus = true) {
    const n = rows.length;
    selected = (i + n) % n;
    rows.forEach((row, k) => row.classList.toggle("selected", k === selected));
    if (focus && !form) rows[selected].focus();
  }

  function close() {
    removeEventListener("keydown", onKey, true);
    overlay.remove();
  }

  /** Back to the terminal from inside (Esc at the top, ✕): the history entry goes back too. */
  function leave() {
    close();
    gameLayer.leave();
    onExit();
  }

  function begin(option: MenuOption, values: Record<string, string>) {
    close();
    // The game takes over this screen's history entry, so Back closes the game.
    gameLayer.handoff();
    option.start?.(values);
  }

  function closeForm() {
    form?.el.remove();
    form = null;
  }

  function pick() {
    const option = stack.at(-1)!.options[selected];
    if (option.submenu)
      return push({
        title: `${stack[0].title} · ${option.label}`,
        options: option.submenu,
      });
    if (!option.fields?.length) return begin(option, {});
    if (form?.option === option) return confirm();
    openForm(option);
  }

  /** The option's settings, under its row; the other rows stay clickable to change your mind. */
  function openForm(option: MenuOption) {
    closeForm();
    const el = document.createElement("div");
    el.className = "game-menu-input";
    const values: Record<string, string> = {};
    const controls: NonNullable<typeof form>["controls"] = [];
    for (const field of option.fields!) {
      if (field.kind === "text") {
        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = field.placeholder;
        input.value = field.value ?? "";
        input.maxLength = field.maxLength;
        input.autocapitalize = "off";
        input.spellcheck = false;
        input.setAttribute("autocomplete", "off");
        input.setAttribute("aria-label", field.placeholder);
        values[field.key] = input.value;
        input.addEventListener(
          "input",
          () => (values[field.key] = input.value),
        );
        el.append(input);
        controls.push({ field, el: input });
      } else {
        // A choice: its label and the values side by side; the current one is marked.
        const row = document.createElement("div");
        row.className = "game-menu-choice";
        row.tabIndex = 0;
        row.setAttribute("role", "radiogroup");
        row.setAttribute("aria-label", field.label);
        const name = document.createElement("span");
        name.className = "choice-label";
        name.textContent = `${field.label}:`;
        row.append(name);
        values[field.key] = field.value ?? field.options[0].value;
        const buttons = field.options.map((o) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = o.label;
          b.setAttribute("role", "radio");
          b.addEventListener("click", () => setValue(o.value));
          row.append(b);
          return b;
        });
        const setValue = (value: string) => {
          values[field.key] = value;
          field.options.forEach((o, k) =>
            buttons[k].setAttribute("aria-checked", String(o.value === value)),
          );
        };
        setValue(values[field.key]);
        el.append(row);
        controls.push({
          field,
          el: row,
          set(dir) {
            const k = field.options.findIndex(
              (o) => o.value === values[field.key],
            );
            setValue(
              field.options[
                (k + dir + field.options.length) % field.options.length
              ].value,
            );
          },
        });
      }
    }
    const error = document.createElement("span");
    error.className = "error";
    error.setAttribute("aria-live", "polite");
    el.append(error);
    rows[selected].after(el);
    form = { option, el, values, controls, focus: 0, error };
    focusControl(0);
  }

  function focusControl(i: number) {
    if (!form) return;
    form.focus = (i + form.controls.length) % form.controls.length;
    form.controls[form.focus].el.focus();
  }

  function confirm() {
    if (!form) return;
    const { option, values, error } = form;
    for (const c of form.controls) {
      if (c.field.kind !== "text") continue;
      const value = (values[c.field.key] ?? "").trim();
      if (
        (c.field.required && !value) ||
        (value && c.field.valid && !c.field.valid(value))
      ) {
        error.textContent = c.field.invalid ?? "";
        c.el.focus();
        return;
      }
      values[c.field.key] = value;
    }
    begin(option, values);
  }

  function onKey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const control = form?.controls[form.focus];
    const typing =
      control?.field.kind === "text" && document.activeElement === control.el;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "Escape") {
      stop();
      // Esc closes the settings first, then goes back a level, then leaves.
      if (form) {
        closeForm();
        return select(selected);
      }
      if (stack.length > 1) {
        // Back on the option that opened the list.
        const closed = stack.pop()!;
        const level = stack.at(-1)!;
        return show(
          level,
          level.options.findIndex((o) => o.submenu === closed.options),
        );
      }
      return leave();
    }
    if (e.key === "Enter") {
      stop();
      return form ? confirm() : pick();
    }
    if (
      form &&
      (e.key === "ArrowUp" || e.key === "ArrowDown") &&
      form.controls.length > 1
    ) {
      stop();
      return focusControl(form.focus + (e.key === "ArrowDown" ? 1 : -1));
    }
    if (
      form &&
      control?.set &&
      (e.key === "ArrowLeft" || e.key === "ArrowRight")
    ) {
      stop();
      return control.set(e.key === "ArrowRight" ? 1 : -1);
    }
    if (typing || form) return;
    const up = e.key === "ArrowUp" || e.key === "w" || e.key === "W";
    const down = e.key === "ArrowDown" || e.key === "s" || e.key === "S";
    if (up || down) {
      stop();
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
  push({ title, options });
}
