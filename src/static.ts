// Plain HTML version of the portfolio. Rendered into index.html at build time so crawlers
// and no-JS visitors get the full content, and reused at runtime for the "simple version".
import {
  education,
  experience,
  languages,
  profile,
  projects,
  stack,
  type Lang,
} from "./content.ts";
import { ui } from "./i18n.ts";
import { iconSvg, type IconName } from "./icons.ts";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const tags = (items: string[]) =>
  `<p class="tags">${items.map((i) => `<span class="tag">${esc(i)}</span>`).join("")}</p>`;

/** "Label: text" with the label in bold, like the terminal. */
const highlight = (text: string) => {
  const cut = text.indexOf(": ");
  return cut < 0 || cut > 40 ? esc(text) : `<strong>${esc(text.slice(0, cut + 1))}</strong>${esc(text.slice(cut + 1))}`;
};

const a = (url: string, label: string) =>
  `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(label)}</a>`;

export function renderStatic(lang: Lang): string {
  const t = ui[lang];
  const linkedin = profile.links.find((l) => l.label === "LinkedIn")!;

  const jobs = experience.length
    ? experience
        .map(
          (j) => `<article class="job">
  <h3 class="job-head">${esc(j.company)} <span class="meta">${esc(j.period[lang])}</span></h3>
  <p class="job-role">${esc(j.role[lang])}<span class="meta">, ${esc(j.place[lang])}</span></p>
  ${j.about ? `<p class="meta">${esc(j.about[lang])}</p>` : ""}
  <ul>${j.bullets.map((b) => `<li>${esc(b[lang])}</li>`).join("")}</ul>
  ${j.stack ? tags(j.stack) : ""}
</article>`,
        )
        .join("\n")
    : `<p>${esc(t.emptyExperience)} ${a(linkedin.url, linkedin.label)}</p>`;

  const projs = projects
    .map(
      (p) => `<article class="job has-logo">
  <img class="job-logo" src="${p.logo}" alt="" width="18" height="18" />
  <h3 class="job-head">${a(p.url, p.name)} <span class="meta">${esc(p.status[lang])}</span></h3>
  <p class="job-role">${esc(p.role[lang])}</p>
  <p class="meta"><em>${esc(p.tagline[lang])}</em> ${esc(p.description[lang])}</p>
  <ul>${p.highlights.map((x) => `<li>${highlight(x[lang])}</li>`).join("")}</ul>
  ${tags(p.stack)}
</article>`,
    )
    .join("\n");

  return `<header>
  <button type="button" class="download" data-download aria-label="${esc(t.downloadLabel)}">${iconSvg("cv")}${esc(t.download)}</button>
  <h1>${esc(profile.name)}</h1>
  <p class="role">${esc(profile.role[lang])}, ${esc(profile.location[lang])}</p>
</header>
<section id="sobre"><h2>${iconSvg("about")}${t.sectionAbout}</h2><p>${esc(profile.summary[lang])}</p><p>${esc(profile.now[lang])}</p><p>${esc(profile.extra[lang])}</p></section>
<section id="experiencia"><h2>${iconSvg("experience")}${t.sectionExperience}</h2>${jobs}</section>
<section id="projetos"><h2>${iconSvg("projects")}${t.sectionProjects}</h2>${projs}</section>
<section id="stack"><h2>${iconSvg("stack")}${t.sectionStack}</h2>${stack
    .map(
      (g) =>
        `<div class="stack-group"><p class="stack-title">${esc(g.group[lang])}</p>${tags(g.items)}</div>`,
    )
    .join("")}</section>
<section id="formacao"><h2>${iconSvg("education")}${t.sectionEducation}</h2>${education
    .map(
      (c) =>
        `<article class="job"><h3 class="job-head">${esc(c.school)} <span class="meta">${c.period}</span></h3><p class="job-role">${esc(c.degree[lang])}</p></article>`,
    )
    .join("\n")}
<div class="stack-group after-timeline"><p class="stack-title">${t.languagesTitle}</p>${tags(languages.map((l) => l[lang]))}</div></section>
<section id="contato"><h2>${iconSvg("contact")}${t.sectionContact}</h2><ul>
  <li>${iconSvg("email")}<a href="mailto:${profile.email}">${profile.email}</a></li>
  ${profile.links
    .map(
      (l) =>
        `<li>${iconSvg(l.label.toLowerCase() as IconName)}${a(l.url, l.label)}</li>`,
    )
    .join("\n  ")}
</ul></section>`;
}
