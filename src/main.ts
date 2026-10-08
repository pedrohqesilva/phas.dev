import "@fontsource-variable/geist-mono";
import { handleBack } from "./back.ts";
import { banner } from "./banner.ts";
import { resolve, tabIds, THEMES, type Theme } from "./commands.ts";
import { profile, type Lang } from "./content.ts";
import { cmd, h } from "./dom.ts";
import { matrixBackdrop } from "./fun.ts";
import { ui } from "./i18n.ts";
import { icon } from "./icons.ts";
import { pageTitle, pathFor } from "./seo.ts";
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

const currentPath = () =>
  location.pathname.replace(/(.)\/$/, "$1").toLowerCase();

/** Addresses that fix the language: each page exists in both, and the address says which one it is. */
const PATH_LANG: Record<string, Lang> = {
  "/en": "en",
  "/resume": "en",
  "/simple": "en",
  "/curriculo": "pt",
  "/simples": "pt",
};
/** Robots read each address in its own language: no guessing from their browser settings. */
const isBot = /bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(
  navigator.userAgent,
);

const initialLang: Lang =
  PATH_LANG[currentPath()] ??
  (isBot ? "pt" : null) ??
  (store.get("lang") as Lang | null) ??
  (navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en");
const saved = store.get("theme") as Theme | null;
const initialTheme: Theme =
  (saved && THEMES.includes(saved) ? saved : null) ??
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
    onCommand(id, run) {
      // Each section is a step in the browser history, so the phone's Back returns to the previous one.
      if (tabIds.includes(id) && id !== "help" && !run.replaying && !restoring)
        history.pushState({ run: run.n, cmd: run.input }, "");
    },
    onClear: () => {},
    home,
  },
);

function applyLang(lang: Lang) {
  const t = ui[lang];
  term.lang = lang;
  root.lang = lang === "pt" ? "pt-BR" : "en";
  document.title = pageTitle(
    lang,
    root.classList.contains("simple") ? "resume" : "home",
  );
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
  // The address follows: /curriculo ⇄ /resume, / ⇄ /en (games and other addresses stay put).
  if (isSimplePath() || HOME_PATHS.includes(currentPath()))
    history.replaceState(
      history.state,
      "",
      pagePath() + location.search + location.hash,
    );
}

const HOME_PATHS = ["/", "/en"];
/** This view's address in the current language. */
const pagePath = () =>
  pathFor(root.classList.contains("simple") ? "resume" : "home", term.lang);

function applyThemeLabel() {
  const current = (root.dataset.theme as Theme) ?? initialTheme;
  // The button flips between light and dark; the other palettes are reached with the `tema` command.
  const next: Theme = current === "light" ? "dark" : "light";
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
  matrixBackdrop(theme === "matrix");
  store.set("theme", theme);
  applyThemeLabel();
}

/** `/simples` (or `/simple`) is the simple version's own address, so it can be shared or bookmarked. */
// /curriculo, /resume and /cv are the same page: the simple version is the resume (and prints as one).
const SIMPLE_PATHS = ["/simples", "/simple", "/curriculo", "/resume", "/cv"];
const isSimplePath = () => SIMPLE_PATHS.includes(currentPath());

function setSimple(on: boolean, push = true) {
  root.classList.toggle("simple", on);
  document.title = pageTitle(term.lang, on ? "resume" : "home");
  if (push && on !== isSimplePath()) history.pushState(null, "", pagePath());
  if (on) $("static").focus();
  else term.focus();
}
/** True while Back re-runs a section that is no longer on screen (that must not add a new step). */
let restoring = false;

addEventListener("popstate", (e) => {
  // A game open: Back closes it.
  if (handleBack()) return;
  // The simple version has its own address.
  const simple = isSimplePath();
  if (simple !== root.classList.contains("simple"))
    return setSimple(simple, false);
  // Sections: back to the previous one on screen (run again if it was cleared), or to the top.
  const state = e.state as { run?: number; cmd?: string } | null;
  if (!state?.run) return term.scrollToTop();
  if (term.scrollToRun(state.run) || !state.cmd) return;
  restoring = true;
  try {
    term.run(state.cmd);
  } finally {
    restoring = false;
  }
});

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
    h(
      "p",
      { class: "title welcome-name" },
      profile.name,
      h("span", { class: "welcome-role" }, profile.role[term.lang]),
    ),
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

/** /snake and /invaders (and /cobrinha) open straight on that game's start screen. */
const GAME_PATHS: Record<string, string> = {
  "/snake": "snake",
  "/cobrinha": "snake",
  "/invaders": "invaders",
  "/pong": "pong",
  "/tetris": "tetris",
};
const gameFromPath = () => GAME_PATHS[currentPath()];

async function boot() {
  const t = ui[term.lang];
  const game = gameFromPath();
  // A key or a tap skips the rest; reduced motion never animates; a game link skips it too.
  let fast = reducedMotion || !!game;
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
  if (game) {
    // The game opens over the terminal; leaving it lands on the home address.
    history.replaceState(null, "", pathFor("home", term.lang));
    term.run(`${term.lang === "pt" ? "jogos" : "games"} ${game}`);
  } else if (!runQuery() && !runHash()) startMenu();
  if (!navigator.onLine) offlineNote();
  term.focus();
}

/** Without a connection, one line says what still works. */
function offlineNote() {
  term.print(h("p", { class: "muted" }, ui[term.lang].offline));
}
addEventListener("offline", offlineNote);

/**
 * Deep links: #projetos runs that command; #coop-ABCD (a co-op invite) joins that Space Invaders room.
 * True when the hash did something.
 */
function runHash(): boolean {
  const hash = decodeURIComponent(location.hash.slice(1));
  // Invites: #coop-ABCD (Space Invaders co-op), #invaders-ABCD (its versus), #pong-ABCD, #tetris-ABCD.
  const invite = /^(coop|invaders|pong|tetris)-([a-z]{4})$/i.exec(hash);
  if (invite) {
    // An invite is used once: a reload must not try to join the same room again.
    history.replaceState(null, "", location.pathname);
    const games = term.lang === "pt" ? "jogos" : "games";
    const room = invite[2].toUpperCase();
    const kind = invite[1].toLowerCase();
    term.run(
      kind === "coop"
        ? `${games} invaders coop ${room}`
        : `${games} ${kind} ${kind === "pong" ? "online" : "versus"} ${room}`,
    );
    return true;
  }
  if (hash && resolve(hash)) {
    term.run(hash);
    return true;
  }
  return false;
}

addEventListener("hashchange", () => runHash());

/**
 * `?q=sobre` (any command line, e.g. `?q=jogos snake`) runs it right after boot, as if typed.
 * The query is then dropped from the address, so a reload starts clean. True when it ran something.
 */
function runQuery(): boolean {
  const q = new URLSearchParams(location.search).get("q")?.trim().slice(0, 80);
  if (!q) return false;
  history.replaceState(null, "", location.pathname + location.hash);
  if (!resolve(q.split(/\s+/)[0])) return false;
  term.run(q);
  return true;
}

// Phones: the terminal follows the visible area, which shrinks when the on-screen keyboard opens, and the
// output scrolls to the end so the prompt stays in sight while typing.
const viewport = window.visualViewport;
if (viewport) {
  const prompt = $<HTMLInputElement>("cmd");
  const screen = $("screen");
  const fitViewport = () => {
    root.style.setProperty("--app-height", `${viewport.height}px`);
    root.style.setProperty("--app-top", `${viewport.offsetTop}px`);
    if (document.activeElement === prompt)
      screen.scrollTop = screen.scrollHeight;
  };
  viewport.addEventListener("resize", fitViewport);
  viewport.addEventListener("scroll", fitViewport);
  // The keyboard animates in after focus: catch the end of it too.
  prompt.addEventListener("focus", () => {
    fitViewport();
    setTimeout(fitViewport, 300);
  });
  fitViewport();
}

root.dataset.theme = initialTheme;
matrixBackdrop(initialTheme === "matrix");
// /simples opens straight on the simple version; the terminal boots behind it.
if (isSimplePath()) setSimple(true, false);
applyLang(initialLang);
// The home address shows its language too: a visitor reading in English lands on /en.
if (currentPath() === "/" && initialLang === "en")
  history.replaceState(null, "", "/en" + location.search + location.hash);
boot();

// Offline mode (src/pwa.ts): only the built site has a service worker.
if (import.meta.env.PROD && "serviceWorker" in navigator)
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
