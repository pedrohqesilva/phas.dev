// `curl phas.dev`: the resume for a terminal, in colour (ANSI escapes), 80 columns wide. The build writes
// one file per language; the server answers with it when the request comes from curl, Wget or HTTPie.
import {
  education,
  experience,
  languages,
  profile,
  projects,
  stack,
  type Lang,
} from "./content.ts";
import { ART } from "./banner.ts";

const ESC = "\x1b[";
const paint = (code: string) => (s: string) => `${ESC}${code}m${s}${ESC}0m`;
const accent = paint("38;5;214");
const dim = paint("38;5;245");
const white = paint("1;97");

const WIDTH = 78;
/** Length on screen: the colour codes take no room. */
const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

/** Wraps `text` to the width, every line starting with `indent` (the first with `first`, if given). */
function wrap(text: string, indent = "", first = indent): string[] {
  const lines: string[] = [];
  let line = first;
  let empty = true;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!empty && visible(line) + 1 + visible(word) > WIDTH) {
      lines.push(line);
      line = indent;
      empty = true;
    }
    line += (empty ? "" : " ") + word;
    empty = false;
  }
  if (!empty) lines.push(line);
  return lines;
}

const H = {
  pt: {
    about: "sobre",
    experience: "experiência",
    projects: "projetos",
    stack: "stack",
    education: "formação",
    contact: "contato",
    more: "Versão interativa (com jogos):",
    other: "In English: curl phas.dev/en",
    markdown: "Em Markdown: curl phas.dev/curriculo.md",
  },
  en: {
    about: "about",
    experience: "experience",
    projects: "projects",
    stack: "stack",
    education: "education",
    contact: "contact",
    more: "Interactive version (with games):",
    other: "Em português: curl phas.dev",
    markdown: "As Markdown: curl phas.dev/resume.md",
  },
};

/** A section title: `## name` in the accent, like a prompt. */
const section = (name: string) => [
  "",
  `${accent("──")} ${white(name)} ${accent("─".repeat(Math.max(0, WIDTH - name.length - 4)))}`,
  "",
];

export function resumeAnsi(lang: Lang): string {
  const h = H[lang];
  const out: string[] = [""];
  for (const row of ART.split("\n").filter(Boolean))
    out.push(`  ${accent(row)}`);
  out.push(
    "",
    `  ${white(profile.name)}  ${dim("·")}  ${profile.role[lang]}  ${dim("·")}  ${dim(profile.location[lang])}`,
    `  ${accent(profile.email)}  ${dim("·")}  ${profile.links.map((l) => l.url.replace(/^https?:\/\//, "")).join(dim("  ·  "))}`,
  );

  out.push(...section(h.about));
  for (const p of [profile.summary[lang], profile.now[lang]])
    out.push(...wrap(p, "  "), "");
  out.pop();

  out.push(...section(h.experience));
  for (const j of experience) {
    out.push(
      `  ${white(j.company)}  ${dim(j.period[lang])}`,
      `  ${accent(j.role[lang])}${dim(`, ${j.place[lang]}`)}`,
    );
    for (const b of j.bullets)
      out.push(...wrap(b[lang], "    ", `  ${dim("•")} `));
    out.push("");
  }
  out.pop();

  out.push(...section(h.projects));
  for (const p of projects) {
    out.push(
      `  ${white(p.name)}  ${dim(p.period[lang])}  ${dim(p.url.replace(/^https?:\/\//, ""))}`,
      `  ${accent(p.role[lang])}`,
    );
    out.push(...wrap(`${p.summary[lang]} ${p.status[lang]}`, "  "));
    for (const b of p.bullets)
      out.push(...wrap(b[lang], "    ", `  ${dim("•")} `));
    out.push("");
  }
  out.pop();

  out.push(...section(h.stack));
  const pad = Math.max(...stack.map((g) => g.group[lang].length));
  for (const g of stack)
    out.push(
      ...wrap(
        g.items.join(", "),
        " ".repeat(pad + 4),
        `  ${accent(g.group[lang].padEnd(pad))}  `,
      ),
    );

  out.push(...section(h.education));
  for (const e of education)
    out.push(
      ...wrap(
        `${e.degree[lang]} ${dim(`(${e.period.replace(" - ", "–")})`)}`,
        "    ",
        `  ${white(e.school)}: `,
      ),
    );
  out.push(`  ${dim(languages.map((l) => l[lang]).join(" · "))}`);

  out.push(...section(h.contact));
  out.push(`  ${dim("email")}     ${accent(profile.email)}`);
  for (const l of profile.links)
    out.push(`  ${dim(l.label.toLowerCase().padEnd(9))} ${l.url}`);

  out.push(
    "",
    `  ${dim(h.more)} ${accent(`https://phas.dev${lang === "en" ? "/en" : ""}`)}`,
    `  ${dim(h.other)}`,
    `  ${dim(h.markdown)}`,
    "",
  );
  return out.join("\n");
}
