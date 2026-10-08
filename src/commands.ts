import {
  education,
  experience,
  languages,
  profile,
  projects,
  stack,
  type L,
  type Lang,
} from "./content.ts";
import { ACHIEVEMENTS, unlock, unlocked } from "./achievements.ts";
import { cmd, h, join, link, type Child } from "./dom.ts";
import {
  cowsay,
  fortune,
  HIRE,
  isHire,
  JOKES,
  matrixRain,
  neofetch,
} from "./fun.ts";
import { icon, iconNames, type IconName } from "./icons.ts";
import {
  playInvaders,
  playInvadersCoop,
  type InvadersTexts,
} from "./games/invaders.ts";
import { playInvadersVersus } from "./games/invaders-versus.ts";
import { openGameMenu, type MenuField, type MenuOption } from "./games/menu.ts";
import {
  playPongCpu,
  playPongOnline,
  type PongTexts,
  type VersusTexts,
} from "./games/pong.ts";
import {
  playTetris,
  playTetrisVersus,
  type TetrisTexts,
} from "./games/tetris.ts";
import { cleanName, isRoomCode } from "./games/protocol.ts";
import {
  board,
  savedNick,
  startRun,
  type Entry,
  type Game,
} from "./games/scores.ts";
import { playSnakeArena } from "./games/snake-online.ts";
import { playSnake } from "./games/snake.ts";
import { ui, type UI } from "./i18n.ts";

export const THEMES = [
  "dark",
  "light",
  "dracula",
  "gruvbox",
  "matrix",
] as const;
export type Theme = (typeof THEMES)[number];

export interface Ctx {
  lang: Lang;
  t: UI;
  history: readonly string[];
  print(...children: Child[]): void;
  clear(): void;
  home(): void;
  setLang(lang: Lang): void;
  setTheme(theme: Theme): void;
  showSimple(): void;
  run(input: string): void;
  focus(): void;
  /** True while the screen is being redrawn in another language: print, but don't act again. */
  replaying: boolean;
}

interface Command {
  id: string;
  /** First name of each language is the one shown in help and chips. */
  names: Record<Lang, string[]>;
  desc?: L;
  icon?: IconName;
  /** Values the first argument can take, offered by Tab and the inline suggestion. */
  args?: (lang: Lang) => string[];
  run(args: string[], ctx: Ctx): void;
}

/** When this visit began, for neofetch's uptime. */
const SESSION_START = Date.now();

/** Lowercase and strip accents so `experiência` and `experiencia` both work. */
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const name = (id: string, lang: Lang) =>
  commands.find((c) => c.id === id)!.names[lang][0];
const line = (...children: Child[]) => h("p", null, ...children);
const muted = (...children: Child[]) => h("p", { class: "muted" }, ...children);
const title = (text: string) => h("p", { class: "title" }, text);
/** Opens a URL in a new tab and leaves a clickable link behind in case the popup is blocked. */
function open(url: string, { t, print, replaying }: Ctx) {
  print(line(t.opening, " ", link(url)));
  if (replaying) return;
  if (url.startsWith("mailto:")) location.href = url;
  else window.open(url, "_blank", "noopener");
}

const isEasy = (mode?: string) =>
  ["facil", "easy", "wrap"].includes(normalize(mode ?? ""));

/**
 * Sends each round of a solo game to its leaderboard (when there is a nickname) and keeps the best places
 * reached, for the line printed back in the terminal.
 */
function leaderboardRun(game: Game, nick: string) {
  const run = startRun(game, nick);
  let today: number | null = null;
  let all: number | null = null;
  const better = (a: number | null, b: number | null) =>
    a === null ? b : b === null ? a : Math.min(a, b);
  return {
    round(score: number) {
      void run.submit(score).then((r) => {
        if (!r) return;
        today = better(today, r.today);
        all = better(all, r.all);
      });
    },
    /** The line for the terminal, or nothing if no place was reached. */
    report({ t, lang }: Ctx): Child {
      if (today === null && all === null) return null;
      unlock("ranked");
      return line(
        t.rankPlaced(today, all),
        " ",
        cmd(`ranking ${game}`, name("ranking", lang)),
      );
    },
  };
}

/** Full-screen Snake; back on the terminal it reports the best round. Easy: the walls wrap around. */
function startSnake(ctx: Ctx, easy = false, nick = savedNick.get()) {
  const { t, print, focus, replaying } = ctx;
  if (replaying) return;
  const ranked = leaderboardRun(easy ? "snake-easy" : "snake", nick);
  playSnake(
    {
      title: easy ? t.snakeEasyTitle : "Snake",
      help: t.snakeHelp,
      start: t.gameStart,
      exit: t.gameExit,
      paused: t.gamePaused,
      resume: t.gameResume,
      score: t.gameScore,
      best: t.gameBest,
      speed: t.arenaSpeed,
      shield: t.arenaShield,
    },
    (best) => {
      print(muted(t.snakeOver(best)));
      // The submissions may still be on their way: a moment later, the places reached.
      setTimeout(() => print(ranked.report(ctx)), 600);
      focus();
    },
    {
      wrap: easy,
      onRound(score) {
        ranked.round(score);
        if (score >= 50) unlock("snake");
      },
    },
  );
}

/** The texts every Space Invaders mode shares. */
const invadersTexts = (t: UI, title = "Space Invaders"): InvadersTexts => ({
  title,
  help: t.invadersHelp,
  start: t.gameStart,
  exit: t.gameExit,
  paused: t.gamePaused,
  resume: t.gameResume,
  over: t.invadersOverTitle,
  restart: t.invadersRestart,
  wave: t.invadersWave,
  score: t.gameScore,
  best: t.gameBest,
  missed: t.invadersMissed,
  powers: t.invadersPowers,
  shots: t.invadersShots,
  rapid: t.invadersRapid,
  special: t.invadersSpecial,
});

/** Full-screen Space Invaders; back on the terminal it reports the best score. */
function startInvaders(ctx: Ctx, nick = savedNick.get()) {
  const { t, print, focus, replaying } = ctx;
  if (replaying) return;
  const ranked = leaderboardRun("invaders", nick);
  playInvaders(
    invadersTexts(t),
    (best) => {
      print(muted(t.invadersOver(best)));
      setTimeout(() => print(ranked.report(ctx)), 600);
      focus();
    },
    ranked.round,
  );
}

type TextField = Extract<MenuField, { kind: "text" }>;

/** The nickname field on a mode's start screen: optional, filled with the last one used. */
const nickField = (t: UI): TextField => ({
  kind: "text",
  key: "nick",
  placeholder: t.nickRanking,
  maxLength: 12,
  value: savedNick.get(),
});
/** The room code field: four letters, required. */
const roomField = (t: UI): TextField => ({
  kind: "text",
  key: "code",
  placeholder: t.roomPlaceholder,
  maxLength: 4,
  required: true,
  valid: isRoomCode,
  invalid: t.coopNotFound,
});
/** Cleans and remembers a nickname typed on a start screen. */
const takeNick = (raw: string) => {
  const nick = cleanName(raw);
  savedNick.set(nick);
  return nick;
};

/** Co-op Space Invaders on the server: creates a room (and prints its link) or joins `room`. */
function startCoop({ t, print, focus, replaying, lang }: Ctx, room?: string) {
  if (replaying) return;
  unlock("social");
  playInvadersCoop(
    {
      ...invadersTexts(t, t.coopTitle),
      help: t.coopHelp,
      paused: t.gameLiveMenu,
    },
    {
      waiting: t.coopWaiting,
      share: t.coopShare,
      partnerLeft: t.coopPartnerLeft,
      partnerAway: t.coopPartnerAway,
      reconnecting: t.netReconnecting,
      disconnected: t.netDisconnected,
      unreachable: t.netUnreachable,
      full: t.coopFull,
      notFound: t.coopNotFound,
      you: t.coopYou,
      partner: t.coopPartner,
    },
    {
      room: room?.toUpperCase(),
      onRoom(code) {
        // The link goes to the clipboard when the browser allows it, and stays printed in the terminal.
        const url = inviteUrl(lang, "coop", code);
        navigator.clipboard?.writeText(url).catch(() => {});
        print(line(t.coopLink, " ", link(url)));
      },
      onExit(best, note) {
        print(
          muted(
            note ? `${note} ${t.invadersOver(best)}` : t.invadersOver(best),
          ),
        );
        focus();
      },
    },
  );
}

/** The public Snake arena, as `name` (or an anonymous one the server picks). */
function startArena({ t, print, focus, replaying }: Ctx, name = "") {
  if (replaying) return;
  unlock("social");
  playSnakeArena(
    {
      title: t.arenaTitle,
      help: t.arenaHelp,
      start: t.gameStart,
      exit: t.gameExit,
      paused: t.gameLiveMenu,
      resume: t.gameResume,
      score: t.gameScore,
      best: t.gameBest,
      online: t.arenaOnline,
      top: t.arenaTop,
      respawn: t.arenaRespawn,
      connecting: t.netConnecting,
      reconnecting: t.netReconnecting,
      disconnected: t.netDisconnected,
      unreachable: t.netUnreachable,
      full: t.arenaFull,
      bot: t.arenaBot,
      speed: t.arenaSpeed,
      shield: t.arenaShield,
    },
    name,
    (best, note) => {
      print(muted(note ? `${note} ${t.snakeOver(best)}` : t.snakeOver(best)));
      focus();
    },
  );
}

/** A versus or co-op mode's second list: create a room (its link is printed) or join one by its code. */
const roomChoices = (
  t: UI,
  create: () => void,
  join: (code: string) => void,
): MenuOption[] => [
  { label: t.roomCreate, hint: t.roomCreateDesc, start: create },
  {
    label: t.roomJoin,
    hint: t.coopJoinDesc,
    fields: [roomField(t)],
    start: (v) => join(v.code.toUpperCase()),
  },
];

/** Snake's start screen: Classic (nickname, and whether the walls kill or wrap) or the online arena. */
function snakeMenu(ctx: Ctx) {
  if (ctx.replaying) return;
  const { t } = ctx;
  openGameMenu(
    "Snake",
    [
      {
        label: t.modeClassic,
        hint: t.snakeDesc,
        fields: [
          nickField(t),
          {
            kind: "choice",
            key: "walls",
            label: t.wallsLabel,
            options: [
              { label: t.wallsKill, value: "kill" },
              { label: t.wallsWrap, value: "wrap" },
            ],
          },
        ],
        start: (v) => startSnake(ctx, v.walls === "wrap", takeNick(v.nick)),
      },
      {
        label: t.modeOnline,
        hint: t.arenaDesc,
        fields: [{ ...nickField(t), placeholder: t.nicknamePlaceholder }],
        start: (v) => startArena(ctx, takeNick(v.nick)),
      },
    ],
    { keys: t.gameMenuKeys, exit: t.gameExit },
    ctx.focus,
  );
}

/** Space Invaders' start screen: Classic (with a nickname), Co-op or Versus (create a room or join one). */
function invadersMenu(ctx: Ctx) {
  if (ctx.replaying) return;
  const { t } = ctx;
  openGameMenu(
    "Space Invaders",
    [
      {
        label: t.modeClassic,
        hint: t.invadersDesc,
        fields: [nickField(t)],
        start: (v) => startInvaders(ctx, takeNick(v.nick)),
      },
      {
        label: t.modeCoop,
        hint: t.coopDesc,
        submenu: roomChoices(
          t,
          () => startCoop(ctx),
          (code) => startCoop(ctx, code),
        ),
      },
      {
        label: t.modeVersus,
        hint: t.invadersVersusDesc,
        submenu: roomChoices(
          t,
          () => startInvadersVersus(ctx),
          (code) => startInvadersVersus(ctx, code),
        ),
      },
    ],
    { keys: t.gameMenuKeys, exit: t.gameExit },
    ctx.focus,
  );
}

const pongTexts = (t: UI, paused = t.gamePaused): PongTexts => ({
  title: "Pong",
  help: t.pongHelp,
  start: t.gameStart,
  exit: t.gameExit,
  paused,
  resume: t.gameResume,
  you: t.pongYou,
  rival: t.pongRival,
  cpu: t.pongCpu,
  win: t.pongWin,
  lose: t.pongLose,
  again: t.pongAgain,
  waitingAgain: t.pongWaitingAgain,
});

const tetrisTexts = (t: UI, paused = t.gamePaused): TetrisTexts => ({
  title: "Tetris",
  help: t.tetrisHelp,
  start: t.gameStart,
  exit: t.gameExit,
  paused,
  resume: t.gameResume,
  score: t.tetrisScore,
  lines: t.tetrisLines,
  level: t.tetrisLevel,
  next: t.tetrisNext,
  hold: t.tetrisHold,
  over: t.tetrisOver,
  again: t.pongAgain,
  rival: t.pongRival,
  win: t.pongWin,
  lose: t.pongLose,
  waitingAgain: t.pongWaitingAgain,
});

const versusTexts = (t: UI): VersusTexts => ({
  waiting: t.coopWaiting,
  share: t.versusShare,
  partnerAway: t.coopPartnerAway,
  partnerLeft: t.coopPartnerLeft,
  reconnecting: t.netReconnecting,
  disconnected: t.netDisconnected,
  unreachable: t.netUnreachable,
  full: t.coopFull,
  notFound: t.coopNotFound,
});

/**
 * A room's invite link: phas.dev/pong/ABCD (with /en in front from the English site), whose preview in a
 * chat shows the game and the room.
 */
const inviteUrl = (lang: Lang, game: string, code: string) =>
  `${location.origin}${lang === "en" ? "/en" : ""}/${game}/${code}`;

/** Prints a versus room's invite link (and copies it) when the room is created. */
const announceRoom =
  ({ t, print, lang }: Ctx, game: "pong" | "tetris" | "invaders") =>
  (code: string) => {
    const url = inviteUrl(lang, game, code);
    navigator.clipboard?.writeText(url).catch(() => {});
    print(line(t.versusLink, " ", link(url)));
  };

/** Space Invaders versus on the server: creates a room (and prints its link) or joins `room`. */
function startInvadersVersus(ctx: Ctx, room?: string) {
  const { t, print, focus, replaying } = ctx;
  if (replaying) return;
  unlock("social");
  playInvadersVersus(
    {
      ...invadersTexts(t, t.invadersVersusTitle),
      help: t.invadersVersusHelp,
      paused: t.gameLiveMenu,
      you: t.pongYou,
      rival: t.pongRival,
      win: t.pongWin,
      lose: t.pongLose,
      again: t.pongAgain,
      waitingAgain: t.pongWaitingAgain,
    },
    versusTexts(t),
    {
      room: room?.toUpperCase(),
      onRoom: announceRoom(ctx, "invaders"),
      onExit(note) {
        if (note) print(muted(note));
        focus();
      },
    },
  );
}

function startPong(ctx: Ctx, mode: "cpu" | "online", room?: string) {
  const { t, print, focus, replaying } = ctx;
  if (replaying) return;
  if (mode === "cpu")
    return playPongCpu(pongTexts(t), ([a, b]) => {
      print(muted(t.pongOver(a, b)));
      focus();
    });
  unlock("social");
  playPongOnline(pongTexts(t, t.gameLiveMenu), versusTexts(t), {
    room: room?.toUpperCase(),
    onRoom: announceRoom(ctx, "pong"),
    onExit(note) {
      if (note) print(muted(note));
      focus();
    },
  });
}

function startTetris(ctx: Ctx, mode: "solo" | "versus", nickOrRoom?: string) {
  const { t, print, focus, replaying } = ctx;
  if (replaying) return;
  if (mode === "versus") unlock("social");
  if (mode === "versus")
    return playTetrisVersus(tetrisTexts(t, t.gameLiveMenu), versusTexts(t), {
      room: nickOrRoom?.toUpperCase(),
      onRoom: announceRoom(ctx, "tetris"),
      onExit(note) {
        if (note) print(muted(note));
        focus();
      },
    });
  const ranked = leaderboardRun("tetris", nickOrRoom ?? savedNick.get());
  playTetris(
    tetrisTexts(t),
    (best) => {
      print(muted(t.tetrisOverLine(best)));
      setTimeout(() => print(ranked.report(ctx)), 600);
      focus();
    },
    ranked.round,
  );
}

function pongMenu(ctx: Ctx) {
  if (ctx.replaying) return;
  const { t } = ctx;
  openGameMenu(
    "Pong",
    [
      {
        label: t.modeClassic,
        hint: t.pongCpuDesc,
        start: () => startPong(ctx, "cpu"),
      },
      {
        label: t.modeVersus,
        hint: t.pongOnlineDesc,
        submenu: roomChoices(
          t,
          () => startPong(ctx, "online"),
          (code) => startPong(ctx, "online", code),
        ),
      },
    ],
    { keys: t.gameMenuKeys, exit: t.gameExit },
    ctx.focus,
  );
}

function tetrisMenu(ctx: Ctx) {
  if (ctx.replaying) return;
  const { t } = ctx;
  openGameMenu(
    "Tetris",
    [
      {
        label: t.modeClassic,
        hint: t.tetrisSoloDesc,
        fields: [nickField(t)],
        start: (v) => startTetris(ctx, "solo", takeNick(v.nick)),
      },
      {
        label: t.modeVersus,
        hint: t.tetrisVersusDesc,
        submenu: roomChoices(
          t,
          () => startTetris(ctx, "versus"),
          (code) => startTetris(ctx, "versus", code),
        ),
      },
    ],
    { keys: t.gameMenuKeys, exit: t.gameExit },
    ctx.focus,
  );
}

function playPongMode(ctx: Ctx, mode?: string, extra?: string) {
  const m = normalize(mode ?? "");
  if (["cpu", "computador", "computer", "solo", "treino"].includes(m))
    return startPong(ctx, "cpu");
  if (isOnline(m) || isCoop(m) || m === "versus" || m === "1x1" || m === "1v1")
    return startPong(
      ctx,
      "online",
      extra && isRoomCode(extra) ? extra : undefined,
    );
  pongMenu(ctx);
}

function playTetrisMode(ctx: Ctx, mode?: string, extra?: string) {
  const m = normalize(mode ?? "");
  if (["solo", "single", "classico", "classic"].includes(m))
    return startTetris(ctx, "solo");
  if (
    isOnline(m) ||
    isCoop(m) ||
    m === "versus" ||
    m === "vs" ||
    m === "1x1" ||
    m === "1v1"
  )
    return startTetris(
      ctx,
      "versus",
      extra && isRoomCode(extra) ? extra : undefined,
    );
  tetrisMenu(ctx);
}

/** Without a mode, the game's start screen; a mode typed in the command (or an invite) goes straight in. */
function playSnakeMode(ctx: Ctx, mode?: string, extra?: string) {
  if (isOnline(mode)) return startArena(ctx, cleanName(extra ?? ""));
  if (isEasy(mode)) return startSnake(ctx, true);
  if (["classico", "classic", "normal"].includes(normalize(mode ?? "")))
    return startSnake(ctx);
  snakeMenu(ctx);
}

function playInvadersMode(ctx: Ctx, mode?: string, extra?: string) {
  if (
    ["versus", "vs", "1x1", "1v1", "duelo", "duel"].includes(
      normalize(mode ?? ""),
    )
  )
    return startInvadersVersus(
      ctx,
      extra && isRoomCode(extra) ? extra.toUpperCase() : undefined,
    );
  if (isCoop(mode))
    return startCoop(
      ctx,
      extra && isRoomCode(extra) ? extra.toUpperCase() : undefined,
    );
  if (["solo", "single"].includes(normalize(mode ?? "")))
    return startInvaders(ctx);
  invadersMenu(ctx);
}

const isOnline = (mode?: string) =>
  ["online", "arena", "multi", "multiplayer"].includes(normalize(mode ?? ""));
const isCoop = (mode?: string) =>
  ["coop", "co-op", "dupla", "duo", "2p"].includes(normalize(mode ?? ""));

const linkOf = (label: string) =>
  profile.links.find((l) => l.label === label)!.url;
const projectUrl = (name: string) => projects.find((p) => p.name === name)!.url;

/** Technologies as tags, the same look everywhere (stack, jobs, projects). */
const tags = (items: string[]) =>
  h(
    "p",
    { class: "tags" },
    ...items.map((item) => h("span", { class: "tag" }, item)),
  );

/** One job in full: the summary's head, the longer context, the role steps, every point and the whole stack. */
/** A project on the jobs' timeline: logo as the marker, name and period, my role, then `body`. */
function projectEntry(
  p: (typeof projects)[number],
  lang: Lang,
  ...body: (Node | string | false | undefined)[]
): HTMLElement {
  return h(
    "div",
    { class: "entry job has-logo" },
    h("img", {
      class: "job-logo",
      src: p.logo,
      alt: "",
      width: "18",
      height: "18",
    }),
    h(
      "p",
      { class: "job-head" },
      h("span", { class: "title" }, link(p.url, p.name)),
      h("span", { class: "muted" }, p.period[lang]),
    ),
    h("p", { class: "job-role" }, p.role[lang]),
    ...body,
  );
}

/** Everything about a project: the pitch and every labelled highlight. */
const projectInFull = (p: (typeof projects)[number], lang: Lang) =>
  projectEntry(
    p,
    lang,
    h(
      "p",
      { class: "muted" },
      h("em", null, p.tagline[lang]),
      ` ${p.description[lang]} ${p.status[lang]}`,
    ),
    h("ul", null, ...p.highlights.map((x) => highlight(x[lang]))),
    tags(p.stack),
  );

function jobInFull(j: (typeof experience)[number], lang: Lang): HTMLElement {
  const d = j.details!;
  return h(
    "div",
    { class: "entry job" },
    h(
      "p",
      { class: "job-head" },
      h("span", { class: "title" }, j.company),
      h("span", { class: "muted" }, j.period[lang]),
    ),
    h(
      "p",
      { class: "job-role" },
      j.role[lang],
      h("span", { class: "muted" }, `, ${j.place[lang]}`),
    ),
    j.about && muted(j.about[lang]),
    h("p", { class: "para" }, d.intro[lang]),
    ...(d.steps ?? []).map((step) =>
      h(
        "div",
        { class: "step" },
        h(
          "p",
          { class: "step-head" },
          step.title[lang],
          h("span", { class: "muted" }, ` ${step.period[lang]}`),
        ),
        h("p", null, step.text[lang]),
      ),
    ),
    h(
      "ul",
      null,
      ...[...j.bullets, ...(d.bullets ?? [])].map((b) =>
        h("li", null, b[lang]),
      ),
    ),
    tags(d.stack ?? j.stack ?? []),
  );
}

/** A highlight "Label: text" with the label in bold, so a list of them scans by label. */
function highlight(text: string): HTMLElement {
  const cut = text.indexOf(": ");
  if (cut < 0 || cut > 40) return h("li", null, text);
  return h(
    "li",
    null,
    h("strong", null, text.slice(0, cut + 1)),
    text.slice(cut + 1),
  );
}

const sections: Record<string, (ctx: Ctx) => void> = {
  about({ lang, print }) {
    print(
      title(profile.name),
      muted(`${profile.role[lang]}, ${profile.location[lang]}`),
      // Three short paragraphs: who I am, what I do now, how I like to work.
      h("p", { class: "para" }, profile.summary[lang]),
      h("p", { class: "para" }, profile.now[lang]),
      h("p", { class: "para muted" }, profile.extra[lang]),
      line(
        ...join(
          ["experience", "projects", "education", "contact"].map((id) =>
            cmd(name(id, lang)),
          ),
        ),
      ),
    );
  },

  experience({ lang, t, print }) {
    if (!experience.length)
      return print(line(t.emptyExperience, " ", link(linkOf("LinkedIn"))));
    print(
      ...experience.map((j) =>
        // A timeline entry: company and period, then role and place, the context, what I did, the stack.
        h(
          "div",
          { class: "entry job" },
          h(
            "p",
            { class: "job-head" },
            h("span", { class: "title" }, j.company),
            h("span", { class: "muted" }, j.period[lang]),
          ),
          h(
            "p",
            { class: "job-role" },
            j.role[lang],
            h("span", { class: "muted" }, `, ${j.place[lang]}`),
          ),
          j.about && muted(j.about[lang]),
          h("ul", null, ...j.bullets.map((b) => h("li", null, b[lang]))),
          j.stack && tags(j.stack),
          // The longer version is one click (or `experiencia <slug>`) away.
          j.details &&
            h(
              "p",
              { class: "more" },
              cmd(
                `${name("experience", lang)} ${j.slug}`,
                `+ ${t.moreDetails}`,
              ),
            ),
        ),
      ),
    );
  },

  projects({ lang, t, print }) {
    // The same timeline as the jobs: the logo is the marker, then name and period, my role, what it is,
    // the short list and the stack; `projetos vittz` has the rest.
    print(
      ...projects.map((p) =>
        projectEntry(
          p,
          lang,
          h("p", { class: "muted" }, `${p.summary[lang]} ${p.status[lang]}`),
          h("ul", null, ...p.bullets.map((b) => h("li", null, b[lang]))),
          tags(p.stack),
          h(
            "p",
            { class: "more" },
            cmd(
              `${name("projects", lang)} ${normalize(p.name)}`,
              `+ ${t.moreDetails}`,
            ),
          ),
        ),
      ),
    );
  },

  stack({ lang, print }) {
    // One block per group: its name, then each technology as a tag, easier to scan than a comma list.
    print(
      ...stack.map((g) =>
        h(
          "div",
          { class: "stack-group" },
          h("p", { class: "stack-title" }, g.group[lang]),
          tags(g.items),
        ),
      ),
    );
  },

  education({ lang, t, print }) {
    // Courses on the same timeline as the jobs; languages as tags, like the stack.
    print(
      ...education.map((c) =>
        h(
          "div",
          { class: "entry job" },
          h(
            "p",
            { class: "job-head" },
            h("span", { class: "title" }, c.school),
            h("span", { class: "muted" }, c.period),
          ),
          h("p", { class: "job-role" }, c.degree[lang]),
        ),
      ),
      h(
        "div",
        { class: "stack-group after-timeline" },
        h("p", { class: "stack-title" }, t.languagesTitle),
        tags(languages.map((l) => l[lang])),
      ),
    );
  },

  contact({ t, print }) {
    print(
      h(
        "dl",
        { class: "pairs" },
        h("dt", null, icon("email"), t.email.toLowerCase()),
        h("dd", null, link(`mailto:${profile.email}`, profile.email)),
        ...profile.links.flatMap((l) => [
          h(
            "dt",
            null,
            icon(l.label.toLowerCase() as IconName),
            l.label.toLowerCase(),
          ),
          h("dd", null, link(l.url)),
        ]),
      ),
    );
  },
};

/** Fake filesystem: `ls`, `cat` and `cd` map file names onto the sections above. */
const files: Record<Lang, [file: string, section: string][]> = {
  pt: [
    ["sobre.txt", "about"],
    ["experiencia/", "experience"],
    ["projetos/", "projects"],
    ["stack.txt", "stack"],
    ["formacao.txt", "education"],
    ["contato.txt", "contact"],
  ],
  en: [
    ["about.txt", "about"],
    ["experience/", "experience"],
    ["projects/", "projects"],
    ["stack.txt", "stack"],
    ["education.txt", "education"],
    ["contact.txt", "contact"],
  ],
};

const fileSection = (arg: string) => {
  const key = normalize(arg)
    .replace(/^\.?\/?/, "")
    .replace(/\/$/, "");
  for (const list of Object.values(files))
    for (const [file, section] of list)
      if (file.replace(/\/$/, "") === key) return section;
  return undefined;
};

export const commands: Command[] = [
  {
    id: "help",
    names: { pt: ["ajuda", "?"], en: ["help", "?"] },
    desc: { pt: "mostra esta lista", en: "shows this list" },
    icon: "help",
    run(_, { lang, t, print }) {
      const visible = commands.filter((c) => c.desc);
      print(
        title(t.helpTitle),
        h(
          "dl",
          { class: "pairs" },
          ...visible.flatMap((c) => [
            h("dt", null, cmd(c.names[lang][0], undefined, c.icon)),
            h("dd", null, c.desc![lang]),
          ]),
        ),
        muted(t.helpKeys),
        muted(t.helpHidden),
      );
    },
  },
  {
    id: "menu",
    names: { pt: ["inicio", "menu", "start"], en: ["start", "menu"] },
    desc: {
      pt: "ícones para navegar sem saber os comandos",
      en: "icons to browse without knowing the commands",
    },
    icon: "simple",
    run(_, { lang, t, print }) {
      // Navigation only (no theme, language or view switches): each tile is a command, typed on click.
      const label = (id: string): string =>
        ({
          about: t.sectionAbout,
          experience: t.sectionExperience,
          projects: t.sectionProjects,
          stack: t.sectionStack,
          education: t.sectionEducation,
          contact: t.sectionContact,
          cv: t.cvLabel,
          game: t.gamesTitle,
          github: "GitHub",
          linkedin: "LinkedIn",
        })[id] ?? id;
      print(
        muted(t.menuTitle),
        h(
          "div",
          { class: "menu" },
          ...menuIds.map((id) => {
            const c = commands.find((x) => x.id === id)!;
            return h(
              "button",
              {
                type: "button",
                class: "tile",
                "data-cmd": c.names[lang][0],
                "data-id": id,
              },
              icon(id === "game" ? "game" : c.icon!, 28),
              h("span", null, label(id)),
            );
          }),
        ),
        muted(t.menuHint),
      );
    },
  },
  {
    id: "about",
    names: { pt: ["sobre", "whoami"], en: ["about", "whoami"] },
    desc: { pt: "quem sou eu", en: "who I am" },
    icon: "about",
    run: (_, ctx) => sections.about(ctx),
  },
  {
    id: "experience",
    names: { pt: ["experiencia", "exp"], en: ["experience", "exp"] },
    desc: { pt: "onde já trabalhei", en: "where I have worked" },
    icon: "experience",
    // `experiencia paysign` shows that job in full; `experiencia completa` shows every job in full.
    args: () => [...experience.map((j) => j.slug), "completa"],
    run([arg], ctx) {
      const which = normalize(arg ?? "");
      if (!which) return sections.experience(ctx);
      if (["completa", "full", "tudo", "all"].includes(which))
        return ctx.print(
          ...experience
            .filter((j) => j.details)
            .map((j) => jobInFull(j, ctx.lang)),
        );
      const job = experience.find(
        (j) => j.slug === which || normalize(j.company).startsWith(which),
      );
      if (!job?.details) return ctx.print(muted(ctx.t.jobNotFound(arg)));
      ctx.print(jobInFull(job, ctx.lang));
    },
  },
  {
    id: "projects",
    names: { pt: ["projetos", "portfolio"], en: ["projects", "portfolio"] },
    desc: { pt: "projetos em destaque", en: "featured projects" },
    icon: "projects",
    // `projetos vittz` shows that project in full.
    args: () => projects.map((p) => normalize(p.name)),
    run([arg], ctx) {
      const which = normalize(arg ?? "");
      if (!which) return sections.projects(ctx);
      const project = projects.find((p) => normalize(p.name).startsWith(which));
      if (!project) return ctx.print(muted(ctx.t.projectNotFound(arg)));
      ctx.print(projectInFull(project, ctx.lang));
    },
  },
  {
    id: "stack",
    names: {
      pt: ["stack", "tecnologias", "skills"],
      en: ["stack", "skills", "technologies"],
    },
    desc: { pt: "tecnologias que uso", en: "technologies I use" },
    icon: "stack",
    run: (_, ctx) => sections.stack(ctx),
  },
  {
    id: "education",
    names: {
      pt: ["formacao", "educacao", "estudos"],
      en: ["education", "studies"],
    },
    desc: { pt: "formação e idiomas", en: "education and languages" },
    icon: "education",
    run: (_, ctx) => sections.education(ctx),
  },
  {
    id: "contact",
    names: { pt: ["contato", "contatos"], en: ["contact", "contacts"] },
    desc: { pt: "e-mail e redes", en: "email and socials" },
    icon: "contact",
    run: (_, ctx) => sections.contact(ctx),
  },
  {
    id: "github",
    names: { pt: ["github", "gh"], en: ["github", "gh"] },
    desc: { pt: "abre meu GitHub", en: "opens my GitHub" },
    icon: "github",
    run: (_, ctx) => open(linkOf("GitHub"), ctx),
  },
  {
    id: "linkedin",
    names: { pt: ["linkedin", "in"], en: ["linkedin", "in"] },
    desc: { pt: "abre meu LinkedIn", en: "opens my LinkedIn" },
    icon: "linkedin",
    run: (_, ctx) => open(linkOf("LinkedIn"), ctx),
  },
  {
    id: "vittz",
    names: { pt: ["vittz", "vitta"], en: ["vittz", "vitta"] },
    desc: { pt: "abre o site do Vittz", en: "opens the Vittz website" },
    icon: "projects",
    run: (_, ctx) => open(projectUrl("Vittz"), ctx),
  },
  {
    id: "ifleethub",
    names: { pt: ["ifleethub", "ifleet"], en: ["ifleethub", "ifleet"] },
    desc: { pt: "abre o site do iFleetHub", en: "opens the iFleetHub website" },
    icon: "projects",
    run: (_, ctx) => open(projectUrl("iFleetHub"), ctx),
  },
  {
    id: "email",
    names: {
      pt: ["email", "e-mail", "correio"],
      en: ["email", "e-mail", "mail"],
    },
    desc: { pt: "escreve um e-mail para mim", en: "writes me an email" },
    icon: "email",
    run: (_, ctx) => open(`mailto:${profile.email}`, ctx),
  },
  {
    id: "cv",
    names: { pt: ["curriculo", "cv"], en: ["resume", "cv"] },
    desc: {
      pt: "currículo para imprimir ou salvar em PDF",
      en: "printable resume, save as PDF",
    },
    icon: "cv",
    run(_, ctx) {
      const { t, print } = ctx;
      if (profile.cv) {
        print(line(t.cvOpen, " ", link(profile.cv, profile.cv)));
        return void window.open(profile.cv, "_blank", "noopener");
      }
      // No PDF yet: the print stylesheet turns the simple version into a resume.
      if (!ctx.replaying) setTimeout(() => window.print(), 400);
    },
  },
  {
    id: "game",
    names: { pt: ["jogos", "game", "games", "jogo"], en: ["games", "game"] },
    desc: {
      pt: "jogos (snake, invaders, pong, tetris)",
      en: "games (snake, invaders, pong, tetris)",
    },
    icon: "terminal",
    args: () => ["snake", "invaders", "pong", "tetris"],
    run([arg, mode, extra], ctx) {
      const game = normalize(arg ?? "");
      if (!game) {
        // Two games; their modes are picked on each game's own start screen.
        const g = name("game", ctx.lang);
        return ctx.print(
          title(ctx.t.gamesTitle),
          h(
            "dl",
            { class: "pairs" },
            h("dt", null, cmd(`${g} snake`, "snake")),
            h("dd", null, ctx.t.snakeDesc),
            h("dt", null, cmd(`${g} invaders`, "invaders")),
            h("dd", null, ctx.t.invadersDesc),
            h("dt", null, cmd(`${g} pong`, "pong")),
            h("dd", null, ctx.t.pongDesc),
            h("dt", null, cmd(`${g} tetris`, "tetris")),
            h("dd", null, ctx.t.tetrisDesc),
          ),
        );
      }
      if (game === "snake" || game === "cobrinha")
        return playSnakeMode(ctx, mode, extra);
      if (["invaders", "space", "spaceinvaders", "nave"].includes(game))
        return playInvadersMode(ctx, mode, extra);
      if (game === "pong") return playPongMode(ctx, mode, extra);
      if (game === "tetris") return playTetrisMode(ctx, mode, extra);
      ctx.print(muted(ctx.t.gameUsage(arg)));
    },
  },
  {
    id: "snake",
    names: { pt: ["snake", "cobrinha"], en: ["snake"] },
    run: ([mode, extra], ctx) => playSnakeMode(ctx, mode, extra),
  },
  {
    id: "invaders",
    names: { pt: ["invaders", "nave"], en: ["invaders", "spaceinvaders"] },
    run: ([mode, extra], ctx) => playInvadersMode(ctx, mode, extra),
  },
  {
    id: "pong",
    names: { pt: ["pong"], en: ["pong"] },
    run: ([mode, extra], ctx) => playPongMode(ctx, mode, extra),
  },
  {
    id: "tetris",
    names: { pt: ["tetris"], en: ["tetris"] },
    run: ([mode, extra], ctx) => playTetrisMode(ctx, mode, extra),
  },
  {
    id: "achievements",
    names: {
      pt: ["conquistas", "trofeus", "achievements"],
      en: ["achievements", "trophies"],
    },
    desc: {
      pt: "suas conquistas no site (guardadas neste navegador)",
      en: "your achievements on the site (kept in this browser)",
    },
    icon: "terminal",
    run(_, { lang, print }) {
      const have = unlocked();
      print(
        title(
          `${lang === "pt" ? "Conquistas" : "Achievements"} ${have.size}/${ACHIEVEMENTS.length}`,
        ),
        h(
          "dl",
          { class: "pairs achievements" },
          ...ACHIEVEMENTS.flatMap((a) => {
            const got = have.has(a.id);
            const hidden = a.secret && !got;
            return [
              h(
                "dt",
                { class: got ? "got" : "locked" },
                `${got ? a.icon : "·"} ${hidden ? "???" : a.name[lang]}`,
              ),
              h(
                "dd",
                got ? null : { class: "muted" },
                hidden ? (lang === "pt" ? "secreta" : "secret") : a.how[lang],
              ),
            ];
          }),
        ),
      );
    },
  },
  {
    id: "ranking",
    names: {
      pt: ["ranking", "placar", "recordes"],
      en: ["ranking", "leaderboard", "scores"],
    },
    desc: {
      pt: "melhores pontuações dos jogos (hoje e de sempre)",
      en: "best game scores (today and all time)",
    },
    icon: "terminal",
    args: () => ["snake", "invaders", "tetris", "facil"],
    run([arg], ctx) {
      const a = normalize(arg ?? "");
      const games: Game[] =
        a === "snake" || a === "cobrinha"
          ? ["snake"]
          : ["facil", "easy", "snake-easy"].includes(a)
            ? ["snake-easy"]
            : ["invaders", "nave"].includes(a)
              ? ["invaders"]
              : a === "tetris"
                ? ["tetris"]
                : ["snake", "invaders", "tetris"];
      void Promise.all(games.map((g) => board(g))).then((boards) => {
        const { t } = ctx;
        if (boards.every((b) => b === null))
          return ctx.print(muted(t.rankingOffline));
        const list = (entries: Entry[]) =>
          entries.length
            ? h(
                "ol",
                { class: "ranking-list" },
                ...entries.map((e) =>
                  h(
                    "li",
                    null,
                    h("span", null, e.name),
                    h("span", { class: "muted" }, String(e.score)),
                  ),
                ),
              )
            : muted(t.rankingEmpty);
        ctx.print(
          ...games.flatMap((g, i) => {
            const b = boards[i];
            if (!b) return [];
            return [
              title(t.rankingTitle(g)),
              h(
                "div",
                { class: "ranking" },
                h(
                  "div",
                  null,
                  h("p", { class: "stack-title" }, t.rankingToday),
                  list(b.today),
                ),
                h(
                  "div",
                  null,
                  h("p", { class: "stack-title" }, t.rankingAll),
                  list(b.all),
                ),
              ),
            ];
          }),
        );
      });
    },
  },
  {
    id: "lang",
    names: { pt: ["idioma", "lang", "lingua"], en: ["language", "lang"] },
    desc: { pt: "troca o idioma (pt, en)", en: "switches language (pt, en)" },
    icon: "lang",
    args: () => ["pt", "en"],
    run([arg], { t, print, setLang }) {
      const next = normalize(arg ?? "");
      if (next !== "pt" && next !== "en") return print(muted(t.langUsage));
      setLang(next);
    },
  },
  {
    id: "theme",
    names: { pt: ["tema", "cores"], en: ["theme", "colors"] },
    desc: {
      pt: "cores: claro, escuro, dracula, gruvbox, matrix",
      en: "colors: light, dark, dracula, gruvbox, matrix",
    },
    icon: "sun",
    args: (lang) => THEMES.map((th) => ui[lang].themeNames[th]),
    run([arg], { t, print, setTheme }) {
      const a = normalize(arg ?? "");
      // Either language's name works, so `tema dark` is fine too.
      const theme = THEMES.find(
        (th) =>
          normalize(ui.pt.themeNames[th]) === a || ui.en.themeNames[th] === a,
      );
      if (!theme) return print(muted(t.themeUsage));
      setTheme(theme);
    },
  },
  // A theme's name typed alone switches to it (`dracula`, `escuro`…); `matrix` alone is the rain.
  ...THEMES.filter((th) => th !== "matrix").map((th): Command => ({
    id: `theme-${th}`,
    names: {
      pt: [normalize(ui.pt.themeNames[th])],
      en: [ui.en.themeNames[th]],
    },
    run: (_, { setTheme }) => setTheme(th),
  })),
  {
    id: "simple",
    names: { pt: ["simples", "gui"], en: ["simple", "gui"] },
    desc: { pt: "versão sem terminal", en: "version without the terminal" },
    icon: "simple",
    run: (_, { showSimple }) => showSimple(),
  },
  {
    id: "home",
    names: { pt: ["home", "reset"], en: ["home", "reset"] },
    desc: {
      pt: "volta ao início, com a tela limpa",
      en: "back to the start, screen cleared",
    },
    icon: "terminal",
    run: (_, { home }) => home(),
  },
  {
    id: "clear",
    names: { pt: ["limpar", "clear", "cls"], en: ["clear", "cls"] },
    desc: { pt: "limpa a tela", en: "clears the screen" },
    icon: "terminal",
    run: (_, { clear }) => clear(),
  },

  // Hidden: shell-ish commands for people who poke around.
  {
    id: "history",
    names: { pt: ["historico"], en: ["history"] },
    run(_, { history, t, print }) {
      if (!history.length) return print(muted(t.historyEmpty));
      print(
        h(
          "ol",
          { class: "history" },
          ...history.map((c) => h("li", null, cmd(c))),
        ),
      );
    },
  },
  {
    id: "ls",
    names: { pt: ["ls", "dir", "listar"], en: ["ls", "dir", "list"] },
    run([arg], ctx) {
      if (!arg)
        return ctx.print(
          line(
            ...join(
              files[ctx.lang].map(([file]) => cmd(`cat ${file}`, file)),
              "  ",
            ),
          ),
        );
      const section = fileSection(arg);
      if (section !== "experience" && section !== "projects")
        return ctx.print(muted(ctx.t.lsDir(arg)));
      sections[section](ctx);
    },
  },
  {
    id: "cat",
    names: {
      pt: ["cat", "cd", "less", "more"],
      en: ["cat", "cd", "less", "more"],
    },
    run([arg], ctx) {
      if (!arg) return;
      const section = fileSection(arg);
      if (!section) return ctx.print(muted(ctx.t.catMissing(arg)));
      sections[section](ctx);
    },
  },
  {
    id: "icons",
    names: { pt: ["icones", "icons"], en: ["icons"] },
    run: (_, { print }) =>
      print(
        h(
          "div",
          { class: "gallery" },
          ...iconNames.map((n) =>
            h("figure", null, icon(n, 32), h("figcaption", null, n)),
          ),
        ),
      ),
  },
  {
    id: "pwd",
    names: { pt: ["pwd", "ondeestou"], en: ["pwd", "whereami"] },
    run: (_, { t, print }) => print(line(`/home/${t.user}`)),
  },
  {
    id: "echo",
    names: { pt: ["echo", "diga"], en: ["echo", "say"] },
    run: (args, { print }) => print(line(args.join(" "))),
  },
  {
    id: "sudo",
    names: { pt: ["sudo", "su"], en: ["sudo", "su"] },
    run(args, { lang, t, print }) {
      if (!isHire(args)) return print(line(t.sudo));
      unlock("recruiter");
      print(
        h("pre", { class: "ascii" }, HIRE[lang]),
        line(
          ...join(
            [
              name("email", lang),
              name("linkedin", lang),
              name("contact", lang),
            ].map((c) => cmd(c)),
          ),
        ),
      );
    },
  },
  {
    id: "rm",
    names: { pt: ["rm", "apagar"], en: ["rm", "delete"] },
    run: (_, { t, print }) => print(line(t.rm)),
  },
  {
    id: "neofetch",
    names: {
      pt: ["neofetch", "fastfetch", "sistema"],
      en: ["neofetch", "fastfetch", "system"],
    },
    run: (_, { lang, t, print }) =>
      print(
        h(
          "pre",
          { class: "ascii" },
          neofetch(
            lang,
            {
              user: t.user,
              theme: document.documentElement.dataset.theme ?? "dark",
              commands: commands.length,
              since: SESSION_START,
            },
            innerWidth >= 720,
          ),
        ),
      ),
  },
  {
    id: "fortune",
    names: { pt: ["fortune", "sorte", "frase"], en: ["fortune", "quote"] },
    run: (_, { lang, print }) => print(line(fortune(lang))),
  },
  {
    id: "cowsay",
    names: { pt: ["cowsay", "vaca"], en: ["cowsay", "cow"] },
    run: (args, { lang, print }) =>
      print(
        h("pre", { class: "ascii" }, cowsay(args.join(" ") || fortune(lang))),
      ),
  },
  {
    id: "matrix",
    names: { pt: ["matrix", "neo"], en: ["matrix", "neo"] },
    run(_, { replaying, focus }) {
      if (!replaying) matrixRain(focus);
    },
  },
  {
    id: "vim",
    names: {
      pt: ["vim", "vi", "nano", "emacs"],
      en: ["vim", "vi", "nano", "emacs"],
    },
    run: (_, { lang, print }) => print(line(JOKES.vim[lang])),
  },
  {
    id: "vimquit",
    names: { pt: [":q", ":q!", ":wq", ":x"], en: [":q", ":q!", ":wq", ":x"] },
    run: (_, { lang, print }) => print(line(JOKES.quit[lang])),
  },
  {
    id: "coffee",
    names: { pt: ["cafe", "coffee", "brew"], en: ["coffee", "brew"] },
    run: (_, { lang, print }) => print(line(JOKES.coffee[lang])),
  },
  {
    id: "whoami",
    names: { pt: ["whoami", "quemsoueu"], en: ["whoami"] },
    run: (_, { lang, print }) => print(line(JOKES.whoami[lang])),
  },
  {
    id: "make",
    names: { pt: ["make"], en: ["make"] },
    run: (_, { lang, print }) => print(line(JOKES.make[lang])),
  },
  {
    id: "hello",
    names: { pt: ["oi", "ola", "hello", "hi"], en: ["hello", "hi", "hey"] },
    run: (_, { lang, print }) => print(line(JOKES.hello[lang])),
  },
  {
    id: "date",
    names: { pt: ["date", "data", "hora"], en: ["date", "time"] },
    run: (_, { lang, print }) =>
      print(
        line(
          new Date().toLocaleString(lang === "pt" ? "pt-BR" : "en-US", {
            dateStyle: "full",
            timeStyle: "medium",
          }),
        ),
      ),
  },
  {
    id: "exit",
    names: { pt: ["exit", "sair", "logout"], en: ["exit", "quit", "logout"] },
    run: (_, { lang, t, print }) =>
      print(line(t.exit, " ", cmd(name("contact", lang)))),
  },
];

/** The same command line with the command's name in `lang` (`sobre` → `about`), for a redraw. */
export function translateCommand(raw: string, lang: Lang): string {
  const [name, ...args] = raw.trim().split(/\s+/);
  const command = name ? resolve(name) : undefined;
  if (!command) return raw;
  const typed = normalize(name);
  const other: Lang = lang === "pt" ? "en" : "pt";
  // Keep what was typed when it already reads as this language; translate the other one's main name.
  const foreign =
    !command.names[lang].includes(typed) ||
    (command.names[other][0] === typed && command.names[lang][0] !== typed);
  if (!foreign) return raw;
  return [command.names[lang][0], ...args].join(" ");
}

export function resolve(input: string): Command | undefined {
  const n = normalize(input);
  return commands.find((c) => c.names.pt.includes(n) || c.names.en.includes(n));
}

/**
 * Tab completion. Aliases of the same command collapse into one suggestion, shown in the
 * current language, so `exp` completes straight to `experiencia` / `experience`.
 */
export function complete(prefix: string, lang: Lang): string[] {
  const p = normalize(prefix);
  if (!p) return [];
  // After a command name and a space: complete its first argument (`game s` → `game snake`).
  const space = p.indexOf(" ");
  if (space > 0) {
    const word = prefix.slice(0, space);
    const rest = p.slice(space + 1);
    const command = resolve(word);
    if (!command?.args || rest.includes(" ")) return [];
    return command
      .args(lang)
      .filter((a) => normalize(a).startsWith(rest))
      .map((a) => `${word} ${a}`);
  }
  const hits = commands.filter((c) =>
    [...c.names.pt, ...c.names.en].some((n) => n.startsWith(p)),
  );
  return [
    ...new Set(
      hits.map(
        (c) => c.names[lang].find((n) => n.startsWith(p)) ?? c.names[lang][0],
      ),
    ),
  ];
}

/** The start menu's tiles, in reading order. */
export const menuIds = [
  "cv",
  "about",
  "experience",
  "projects",
  "stack",
  "education",
  "contact",
  "game",
  "github",
  "linkedin",
];

/** Commands shown as clickable chips above the terminal, in the current language. */
export const tabIds = [
  "about",
  "experience",
  "projects",
  "stack",
  "education",
  "contact",
  "help",
];

export const chips = (lang: Lang) =>
  tabIds.map((id, i) => {
    const c = commands.find((c) => c.id === id)!;
    const tab = cmd(c.names[lang][0], undefined, c.icon);
    tab.dataset.id = id;
    tab.prepend(
      h("span", { class: "key", "aria-hidden": "true" }, String(i + 1)),
    );
    return tab;
  });
