// Easter eggs for people who poke around the terminal: neofetch, fortune, cowsay, a hiring sudo, the
// Matrix rain and a few classic shell jokes. None of them is listed in `ajuda`; its last line says some
// commands are hidden.
import type { L, Lang } from "./content.ts";

/** Lines of dev wisdom (written for this site), one per `fortune`. */
const FORTUNES: L[] = [
  {
    pt: "Funciona na minha máquina. Então a gente entrega a minha máquina.",
    en: "It works on my machine. So we ship my machine.",
  },
  {
    pt: "Todo sistema legado já foi o projeto novo e empolgante de alguém.",
    en: "Every legacy system was once someone's exciting new project.",
  },
  {
    pt: "O melhor código é o que você não precisou escrever.",
    en: "The best code is the code you didn't have to write.",
  },
  {
    pt: "Microsserviço é monólito com latência de rede.",
    en: "A microservice is a monolith with network latency.",
  },
  {
    pt: "Dar nome às coisas é difícil. Cache também. E erro de um a mais.",
    en: "Naming things is hard. So is caching. And off-by-one errors.",
  },
  {
    pt: "Se o teste nunca falhou, ele não testou nada.",
    en: "If the test never failed, it never tested anything.",
  },
  {
    pt: "Deploy de sexta é coragem. Rollback de sexta é experiência.",
    en: "A Friday deploy is courage. A Friday rollback is experience.",
  },
  {
    pt: "Documentação é uma carta de amor para o você de daqui a seis meses.",
    en: "Documentation is a love letter to yourself six months from now.",
  },
  {
    pt: "O bug estava no último lugar onde você olhou. Sempre está.",
    en: "The bug was in the last place you looked. It always is.",
  },
  {
    pt: "Simples de evoluir vale mais que esperto de ler.",
    en: "Easy to change beats clever to read.",
  },
  {
    pt: "Toda estimativa é otimista até o primeiro merge.",
    en: "Every estimate is optimistic until the first merge.",
  },
  {
    pt: "Arquitetura é o conjunto de decisões que custa caro mudar depois.",
    en: "Architecture is the set of decisions that are expensive to change later.",
  },
  {
    pt: "Logs são as cartas que o sistema escreve quando você não está olhando.",
    en: "Logs are the letters your system writes while you're not looking.",
  },
  {
    pt: "Não existe código sem dono, só código cujo dono saiu da empresa.",
    en: "There's no ownerless code, only code whose owner left the company.",
  },
  {
    pt: "O usuário sempre encontra o caminho que o teste não cobriu.",
    en: "Users always find the path the tests didn't cover.",
  },
  {
    pt: "Feito é melhor que perfeito. Em produção é melhor que feito.",
    en: "Done beats perfect. In production beats done.",
  },
];

export const fortune = (lang: Lang) =>
  FORTUNES[Math.floor(Math.random() * FORTUNES.length)][lang];

/** A cow saying `text` in a speech balloon, wrapped at 36 columns. */
export function cowsay(text: string): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > 36) {
      if (current) lines.push(current);
      current = word.slice(0, 36);
    } else current = (current + " " + word).trim();
  }
  if (current || !lines.length) lines.push(current);
  const width = Math.max(...lines.map((l) => l.length));
  const pad = (l: string) => l + " ".repeat(width - l.length);
  const body =
    lines.length === 1
      ? [`< ${pad(lines[0])} >`]
      : lines.map((l, i) => {
          const [a, b] =
            i === 0
              ? ["/", "\\"]
              : i === lines.length - 1
                ? ["\\", "/"]
                : ["|", "|"];
          return `${a} ${pad(l)} ${b}`;
        });
  return [
    ` ${"_".repeat(width + 2)}`,
    ...body,
    ` ${"-".repeat(width + 2)}`,
    "        \\   ^__^",
    "         \\  (oo)\\_______",
    "            (__)\\       )\\/\\",
    "                ||----w |",
    "                ||     ||",
  ].join("\n");
}

const LOGO = [
  "  ██████████████  ",
  "  ██          ██  ",
  "  ██  ▶▶      ██  ",
  "  ██    ▶▶    ██  ",
  "  ██  ▶▶  ▄▄▄ ██  ",
  "  ██          ██  ",
  "  ██████████████  ",
];

/** neofetch: this "machine" (the site) and its owner, the logo beside the facts when there is room. */
export function neofetch(
  lang: Lang,
  info: { user: string; theme: string; commands: number; since: number },
  wide: boolean,
): string {
  const minutes = Math.max(1, Math.round((Date.now() - info.since) / 60000));
  const pt = lang === "pt";
  const facts = [
    `${info.user}@phas.dev`,
    "-".repeat(info.user.length + 9),
    `OS: phas.dev ${pt ? "(terminal na web)" : "(web terminal)"}`,
    `Host: Railway us-east4 + Cloudflare`,
    `Kernel: TypeScript · Vite · Node 24`,
    `Uptime: ${minutes} min ${pt ? "nesta visita" : "this visit"}`,
    `Shell: phas-sh`,
    `Resolution: ${innerWidth}x${innerHeight}`,
    `Theme: ${info.theme}`,
    `Packages: ${info.commands} ${pt ? "comandos" : "commands"}`,
    `${pt ? "Dono" : "Owner"}: Pedro Henrique, ${pt ? "Eng. de Software Sênior" : "Senior Software Engineer"}`,
    `${pt ? "Experiência" : "Experience"}: ${pt ? "9 anos de C# e .NET" : "9 years of C# and .NET"}`,
  ];
  if (!wide) return [...LOGO, "", ...facts].join("\n");
  const rows = Math.max(LOGO.length, facts.length);
  return Array.from({ length: rows }, (_, i) =>
    `${(LOGO[i] ?? "").padEnd(20)}  ${facts[i] ?? ""}`.trimEnd(),
  ).join("\n");
}

/** `sudo contratar pedro` (or `sudo hire pedro`): the one sudo that is allowed. */
export const isHire = (args: string[]) =>
  /^(contratar|contrate|hire|contratarpedro|hirepedro)( pedro)?$/.test(
    args.join(" ").toLowerCase(),
  );

export const HIRE: L = {
  pt: "[sudo] senha para visitante: ********\nPermissão concedida.\nIniciando contratação de Pedro Henrique...\n  ✓ C# e .NET\n  ✓ arquitetura e produto\n  ✓ dois SaaS em produção\nÚltimo passo é humano:",
  en: "[sudo] password for guest: ********\nPermission granted.\nHiring Pedro Henrique...\n  ✓ C# and .NET\n  ✓ architecture and product\n  ✓ two SaaS products live\nThe last step is human:",
};

export const JOKES = {
  vim: {
    pt: "Abrindo o vim... Para sair, digite :q! (dizem que funciona).",
    en: "Opening vim... To quit, type :q! (rumour has it that works).",
  },
  quit: {
    pt: "Você saiu do vim. Pouca gente consegue. Parabéns.",
    en: "You exited vim. Few people ever do. Congratulations.",
  },
  coffee: {
    pt: "Passando café... ☕ Pronto. Agora sim dá pra compilar.",
    en: "Brewing coffee... ☕ Done. Now we can compile.",
  },
  whoami: {
    pt: "visitante. Mas, se for recrutador, pode se apresentar no comando contato.",
    en: "guest. If you're a recruiter, though, say hi with the contact command.",
  },
  make: {
    pt: "make: *** Nenhuma regra para fazer o alvo 'sanduiche'. Tente sudo.",
    en: "make: *** No rule to make target 'sandwich'. Try sudo.",
  },
  hello: {
    pt: "Olá! Digite ajuda para ver os comandos (e procure os escondidos).",
    en: "Hi there! Type help for the commands (and look for the hidden ones).",
  },
} satisfies Record<string, L>;

/**
 * The Matrix rain over the whole page for a few seconds; any key, click or tap ends it early. Not shown
 * to people who asked for less motion. `done` runs when it is over.
 */
export function matrixRain(done: () => void) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();
  const canvas = document.createElement("canvas");
  canvas.className = "matrix-rain";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const g = canvas.getContext("2d")!;
  const dpr = devicePixelRatio || 1;
  const size = 16;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  g.scale(dpr, dpr);
  const columns = Math.ceil(innerWidth / size);
  const drops = Array.from({ length: columns }, () => Math.random() * -40);
  const glyphs =
    "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789phasDEV<>{}=;";
  const started = performance.now();
  let last = started;
  let raf = 0;
  let over = false;
  const stop = () => {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    canvas.remove();
    removeEventListener("keydown", stop, true);
    removeEventListener("pointerdown", stop, true);
    done();
  };
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - started > 7000) return stop();
    if (now - last < 50) return;
    last = now;
    g.fillStyle = "rgba(0, 0, 0, 0.08)";
    g.fillRect(0, 0, innerWidth, innerHeight);
    g.font = `${size}px "Geist Mono Variable", ui-monospace, monospace`;
    drops.forEach((y, i) => {
      g.fillStyle = Math.random() > 0.975 ? "#d8ffd8" : "#00ff41";
      g.fillText(
        glyphs[Math.floor(Math.random() * glyphs.length)],
        i * size,
        y * size,
      );
      drops[i] = y * size > innerHeight && Math.random() > 0.975 ? 0 : y + 1;
    });
  };
  g.fillStyle = "#000";
  g.fillRect(0, 0, innerWidth, innerHeight);
  raf = requestAnimationFrame(frame);
  // Listeners after this tick, so the Enter that ran the command does not end it at once.
  setTimeout(() => {
    addEventListener("keydown", stop, true);
    addEventListener("pointerdown", stop, true);
  }, 300);
}
