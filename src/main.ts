import "@fontsource-variable/geist-mono";
import { banner } from "./banner.ts";
import { resolve, tabIds, type Theme } from "./commands.ts";
import { profile, type Lang } from "./content.ts";
import { cmd, h } from "./dom.ts";
import { ui } from "./i18n.ts";
import { icon } from "./icons.ts";
import { renderStatic } from "./static.ts";
import { Terminal } from "./terminal.ts";

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const root = document.documentElement;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Storage can throw in private windows; preferences are a convenience only.
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

const initialLang: Lang =
  (store.get("lang") as Lang | null) ??
  (navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en");
const initialTheme: Theme =
  (store.get("theme") as Theme | null) ??
  (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");

const term = new Terminal(
  initialLang,
  $("screen"),
  $("out"),
  $<HTMLInputElement>("cmd"),
  {
    setLang,
    setTheme,
    showSimple: () => setSimple(true),
    onCommand(id) {
      // Every section ends with the way back to the icons, for visitors who never type.
      if (tabIds.includes(id) && id !== "help") {
        const t = ui[term.lang];
        term.print(
          h(
            "p",
            { class: "back-home" },
            cmd(term.lang === "pt" ? "inicio" : "start", `← ${t.backHome}`),
          ),
        );
      }
    },
    onClear: () => {},
    home,
  },
);

function applyLang(lang: Lang) {
  const t = ui[lang];
  term.lang = lang;
  root.lang = lang === "pt" ? "pt-BR" : "en";
  document.title = `${profile.name}, ${profile.role[lang]}`;
  $("prompt-user").textContent = t.user;
  $("cmd").setAttribute("aria-label", t.inputLabel);
  $("lang-toggle").replaceChildren(
    icon("lang"),
    h("span", null, lang === "pt" ? "EN" : "PT"),
  );
  $("lang-toggle").dataset.cmd = `lang ${lang === "pt" ? "en" : "pt"}`;
  $("simple-toggle").replaceChildren(
    icon("simple"),
    h("span", { class: "label" }, t.simpleView),
  );
  $("simple-toggle").setAttribute("aria-label", t.simpleView);
  $("back-terminal").replaceChildren(
    icon("terminal"),
    h("span", null, t.terminalView),
  );
  $("skip-link").textContent = t.skip;
  $("static-content").innerHTML = renderStatic(lang);
  applyThemeLabel();
}

/** Switching language redraws the whole screen in it, including what was already there. */
function setLang(lang: Lang) {
  store.set("lang", lang);
  applyLang(lang);
  term.relocalize();
}

function applyThemeLabel() {
  const current = (root.dataset.theme as Theme) ?? initialTheme;
  const next: Theme = current === "dark" ? "light" : "dark";
  const t = ui[term.lang];
  // Icon-only button: shows where it goes (sun = switch to light), name for screen readers.
  $("theme-toggle").replaceChildren(icon(next === "light" ? "sun" : "moon"));
  $("theme-toggle").setAttribute("aria-label", `${t.themeNames[next]}`);
  $("theme-toggle").title = t.themeNames[next];
  $("theme-toggle").dataset.cmd =
    `${term.lang === "pt" ? "tema" : "theme"} ${t.themeNames[next]}`;
}

function setTheme(theme: Theme) {
  root.dataset.theme = theme;
  store.set("theme", theme);
  applyThemeLabel();
}

/** `/simples` (or `/simple`) is the simple version's own address, so it can be shared or bookmarked. */
// /curriculo, /resume and /cv are the same page: the simple version is the resume (and prints as one).
const SIMPLE_PATHS = ["/simples", "/simple", "/curriculo", "/resume", "/cv"];
const isSimplePath = () =>
  SIMPLE_PATHS.includes(location.pathname.replace(/\/$/, ""));

function setSimple(on: boolean, push = true) {
  root.classList.toggle("simple", on);
  if (push && on !== isSimplePath())
    history.pushState(
      null,
      "",
      on ? (term.lang === "pt" ? "/simples" : "/simple") : "/",
    );
  if (on) $("static").focus();
  else term.focus();
}
addEventListener("popstate", () => setSimple(isSimplePath(), false));

// The top bar buttons run real commands, so visitors learn the terminal by clicking.
for (const id of ["lang-toggle", "theme-toggle"])
  $(id).addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-cmd]");
    if (!target) return;
    term.type(target.dataset.cmd!);
  });
$("brand-mark").replaceChildren(icon("terminal"));
$("simple-toggle").addEventListener("click", () => setSimple(true));
$("back-terminal").addEventListener("click", () => setSimple(false));
// "Baixar" above the name in the simple version: the print stylesheet turns the page into the resume.
$("static").addEventListener("click", (e) => {
  if ((e.target as HTMLElement).closest("[data-download]")) window.print();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The welcome screen: banner, name, role and the hint, as after boot. */
function welcome() {
  renderWelcome();
  term.remember(renderWelcome);
}

/** Boot lines in their finished state, for a redraw in another language. */
function renderBootDone() {
  for (const line of ui[term.lang].boot)
    term.printNow(
      h(
        "p",
        { class: "boot" },
        h("span", { class: "ok" }, "[ ok ]"),
        " ",
        line,
      ),
    );
}

function renderWelcome() {
  const t = ui[term.lang];
  term.print(
    banner(),
    // The role sits beside the name on wide screens and drops below it on phones (CSS).
    h("p", { class: "title welcome-name" }, profile.name, h("span", { class: "welcome-role" }, profile.role[term.lang])),
    h(
      "p",
      null,
      t.welcomeHint[0],
      cmd(term.lang === "pt" ? "ajuda" : "help"),
      t.welcomeHint[1],
    ),
  );
}

/** `home`: a clean screen with the welcome and the icons again, no section open, no deep link in the URL. */
function home() {
  term.clear();
  if (location.hash) history.replaceState(null, "", location.pathname);
  welcome();
  startMenu();
}

/** The first command runs by itself, so a visitor sees the icons without knowing any command. */
function startMenu() {
  term.run(term.lang === "pt" ? "inicio" : "start");
}

async function boot() {
  const t = ui[term.lang];
  // A key or a tap skips the rest; reduced motion never animates.
  let fast = reducedMotion;
  const skip = () => (fast = true);
  addEventListener("keydown", skip, { once: true });
  addEventListener("pointerdown", skip, { once: true });

  // One step at a time, like a real boot: the line appears pending, waits, flips to ok, then the next.
  for (const line of t.boot) {
    const status = h(
      "span",
      { class: fast ? "ok" : "ok waiting" },
      fast ? "[ ok ]" : "[ .. ]",
    );
    term.printNow(h("p", { class: "boot" }, status, " ", line));
    if (!fast) await sleep(260 + Math.random() * 240);
    status.textContent = "[ ok ]";
    status.classList.remove("waiting");
    if (!fast) await sleep(90);
  }
  term.remember(renderBootDone);

  welcome();

  // Deep links: phas.dev/#projetos runs that command after boot.
  if (!runHash()) startMenu();
  term.focus();
}

/**
 * Deep links: #projetos runs that command; #coop-ABCD (a co-op invite) joins that Space Invaders room.
 * True when the hash did something.
 */
function runHash(): boolean {
  const hash = decodeURIComponent(location.hash.slice(1));
  const invite = /^coop-([a-z]{4})$/i.exec(hash);
  if (invite) {
    // An invite is used once: a reload must not try to join the same room again.
    history.replaceState(null, "", location.pathname);
    term.run(`${term.lang === "pt" ? "jogos" : "games"} invaders coop ${invite[1].toUpperCase()}`);
    return true;
  }
  if (hash && resolve(hash)) {
    term.run(hash);
    return true;
  }
  return false;
}

addEventListener("hashchange", () => runHash());

root.dataset.theme = initialTheme;
applyLang(initialLang);
// /simples opens straight on the simple version; the terminal boots behind it.
if (isSimplePath()) setSimple(true, false);
boot();
