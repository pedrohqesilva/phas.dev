// Plain HTML version of the portfolio. Rendered into index.html at build time so crawlers
// and no-JS visitors get the full content, and reused at runtime for the "simple version".
import {
  certifications,
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

const a = (url: string, label: string) =>
  `<a href="${esc(url)}" rel="noopener" target="_blank">${esc(label)}</a>`;

export function renderStatic(lang: Lang): string {
  const t = ui[lang];
  const linkedin = profile.links.find((l) => l.label === "LinkedIn")!;

  const jobs = experience.length
    ? experience
        .map(
          (j) => `<article class="job">
  <h3>${esc(j.role[lang])} <span>${esc(j.company)}</span></h3>
  <p class="meta">${esc(j.period[lang])}, ${esc(j.place[lang])}</p>
  ${j.about ? `<p>${esc(j.about[lang])}</p>` : ""}
  <ul>${j.bullets.map((b) => `<li>${esc(b[lang])}</li>`).join("")}</ul>
</article>`,
        )
        .join("\n")
    : `<p>${esc(t.emptyExperience)} ${a(linkedin.url, linkedin.label)}</p>`;

  const projs = projects
    .map(
      (p) => `<article class="project">
  <img class="project-logo" src="${p.logo}" alt="" width="44" height="44" />
  <div>
    <h3>${a(p.url, p.name)} <span>${esc(p.url.replace("https://", ""))}</span></h3>
    <p class="meta">${esc(p.status[lang])}. ${esc(p.role[lang])}</p>
    <p class="tagline">"${esc(p.tagline[lang])}"</p>
    <p>${esc(p.description[lang])}</p>
    <ul>${p.highlights.map((x) => `<li>${esc(x[lang])}</li>`).join("")}</ul>
    <p class="meta">${p.stack.map(esc).join(", ")}</p>
  </div>
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
        `<div class="stack-group"><p class="stack-title">${esc(g.group[lang])}</p><p class="tags">${g.items.map((i) => `<span class="tag">${esc(i)}</span>`).join("")}</p></div>`,
    )
    .join("")}</section>
<section id="formacao"><h2>${iconSvg("education")}${t.sectionEducation}</h2>${education
    .map(
      (c) =>
        `<article><h3>${esc(c.degree[lang])}</h3><p class="meta">${esc(c.school)}, ${c.period}</p></article>`,
    )
    .join("\n")}
<article><h3>${t.languagesTitle}</h3><ul>${languages.map((l) => `<li>${esc(l[lang])}</li>`).join("")}</ul></article>
<article><h3>${t.certsTitle}</h3><ul>${certifications.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></article></section>
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
