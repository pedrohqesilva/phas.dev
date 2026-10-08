// Achievements: small goals around the site (read the sections, try the themes, find the hidden
// commands, do well in the games). Kept in this browser only (localStorage); unlocking one shows a toast,
// over a game too, and `conquistas` / `achievements` lists them. The secret ones show as ??? until found.
import type { Lang } from "./content.ts";

export type AchievementId =
  | "curious"
  | "explorer"
  | "polyglot"
  | "stylish"
  | "reader"
  | "recruiter"
  | "tinkerer"
  | "vim"
  | "snake"
  | "defender"
  | "special"
  | "wall"
  | "tetris"
  | "social"
  | "champion"
  | "ranked"
  | "completionist";

type Text = Record<Lang, string>;
interface Achievement {
  id: AchievementId;
  icon: string;
  name: Text;
  how: Text;
  secret?: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "curious",
    icon: "❔",
    name: { pt: "Curioso", en: "Curious" },
    how: { pt: "abrir a ajuda", en: "open the help" },
  },
  {
    id: "explorer",
    icon: "🧭",
    name: { pt: "Explorador", en: "Explorer" },
    how: {
      pt: "ver sobre, experiência, projetos e stack",
      en: "see about, experience, projects and stack",
    },
  },
  {
    id: "polyglot",
    icon: "🌎",
    name: { pt: "Poliglota", en: "Polyglot" },
    how: { pt: "trocar o idioma", en: "switch the language" },
  },
  {
    id: "stylish",
    icon: "🎨",
    name: { pt: "Estiloso", en: "Stylish" },
    how: { pt: "experimentar os cinco temas", en: "try all five themes" },
  },
  {
    id: "reader",
    icon: "📄",
    name: { pt: "Leitor", en: "Reader" },
    how: { pt: "abrir o currículo simples", en: "open the plain resume" },
  },
  {
    id: "recruiter",
    icon: "🤝",
    name: { pt: "Recrutador", en: "Recruiter" },
    how: { pt: "sudo contratar pedro", en: "sudo hire pedro" },
    secret: true,
  },
  {
    id: "tinkerer",
    icon: "🥚",
    name: { pt: "Fuçador", en: "Tinkerer" },
    how: {
      pt: "achar cinco comandos escondidos",
      en: "find five hidden commands",
    },
    secret: true,
  },
  {
    id: "vim",
    icon: "🚪",
    name: { pt: "Sobrevivente do vim", en: "Vim survivor" },
    how: { pt: "sair do vim", en: "get out of vim" },
    secret: true,
  },
  {
    id: "snake",
    icon: "🐍",
    name: { pt: "Cobra criada", en: "Big snake" },
    how: {
      pt: "fazer 50 pontos no Snake clássico",
      en: "score 50 in classic Snake",
    },
  },
  {
    id: "defender",
    icon: "👾",
    name: { pt: "Defensor da Terra", en: "Earth defender" },
    how: {
      pt: "chegar à onda 3 no Space Invaders",
      en: "reach wave 3 in Space Invaders",
    },
  },
  {
    id: "special",
    icon: "★",
    name: { pt: "Especialista", en: "Specialist" },
    how: {
      pt: "disparar o tiro especial no Invaders",
      en: "fire the special shot in Invaders",
    },
  },
  {
    id: "wall",
    icon: "🏓",
    name: { pt: "Paredão", en: "The wall" },
    how: { pt: "vencer o computador no Pong", en: "beat the computer at Pong" },
  },
  {
    id: "tetris",
    icon: "🧱",
    name: { pt: "Tetris!", en: "Tetris!" },
    how: { pt: "limpar 4 linhas de uma vez", en: "clear 4 lines at once" },
  },
  {
    id: "social",
    icon: "📡",
    name: { pt: "Social", en: "Social" },
    how: { pt: "jogar um modo online", en: "play an online mode" },
  },
  {
    id: "champion",
    icon: "🏆",
    name: { pt: "Campeão", en: "Champion" },
    how: {
      pt: "vencer uma partida versus online",
      en: "win an online versus match",
    },
  },
  {
    id: "ranked",
    icon: "📈",
    name: { pt: "No placar", en: "On the board" },
    how: { pt: "entrar num top 10 do ranking", en: "make a top 10" },
  },
  {
    id: "completionist",
    icon: "💯",
    name: { pt: "Completista", en: "Completionist" },
    how: { pt: "desbloquear todas as outras", en: "unlock all the others" },
    secret: true,
  },
];

const KEY = "achievements";
const PROGRESS = "achievements-progress";

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export const unlocked = () => new Set(read<AchievementId[]>(KEY, []));

const lang = (): Lang =>
  document.documentElement.lang.startsWith("pt") ? "pt" : "en";

/** Already unlocked, so games can call `unlock` every frame for free. */
const done = new Set<AchievementId>();

/** Unlocks one (once); a toast says so. */
export function unlock(id: AchievementId) {
  if (done.has(id)) return;
  done.add(id);
  const have = unlocked();
  if (have.has(id)) return;
  have.add(id);
  write(KEY, [...have]);
  const a = ACHIEVEMENTS.find((x) => x.id === id)!;
  toast(a);
  if (
    id !== "completionist" &&
    ACHIEVEMENTS.every((x) => x.id === "completionist" || have.has(x.id))
  )
    setTimeout(() => unlock("completionist"), 1600);
}

/**
 * Counts towards an achievement that needs several different things (sections seen, themes tried, hidden
 * commands found); unlocks it once `need` are in.
 */
export function progress(id: AchievementId, item: string, need: number) {
  const all = read<Record<string, string[]>>(PROGRESS, {});
  const items = new Set(all[id] ?? []);
  items.add(item);
  all[id] = [...items];
  write(PROGRESS, all);
  if (items.size >= need) unlock(id);
}

let shown: HTMLElement | null = null;
function toast(a: Achievement) {
  const l = lang();
  shown?.remove();
  const el = document.createElement("div");
  el.className = "achievement-toast";
  el.setAttribute("role", "status");
  const title = document.createElement("strong");
  title.textContent = `${a.icon} ${a.name[l]}`;
  const sub = document.createElement("span");
  sub.textContent =
    l === "pt" ? "conquista desbloqueada" : "achievement unlocked";
  el.append(sub, title);
  document.body.append(el);
  shown = el;
  setTimeout(() => el.classList.add("gone"), 3200);
  setTimeout(() => el.remove(), 3700);
}

/** What a command does for the achievements (called for every command run by the visitor). */
export function onCommand(id: string) {
  if (id === "help") unlock("curious");
  if (["about", "experience", "projects", "stack"].includes(id))
    progress("explorer", id, 4);
  if (id === "vimquit") unlock("vim");
  if (HIDDEN.includes(id)) progress("tinkerer", id, 5);
}

/** The hidden commands (not in `help`). */
const HIDDEN = [
  "neofetch",
  "fortune",
  "cowsay",
  "matrix",
  "vim",
  "coffee",
  "make",
  "hello",
  "date",
  "rm",
  "cat",
  "sudo",
  "whoami",
  "pwd",
  "echo",
];
