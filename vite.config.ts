import { readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { attachGames } from "./server/games.ts";
import { ui } from "./src/i18n.ts";
import {
  humansTxt,
  llmsFullTxt,
  llmsTxt,
  PAGES,
  renderHead,
  resumeMarkdown,
  robotsTxt,
  sitemapXml,
} from "./src/seo.ts";
import { renderStatic } from "./src/static.ts";

/** The page-specific parts of index.html, between markers so the build can swap them per page. */
const block = (name: string, html: string) =>
  `<!--${name}:start-->${html}<!--${name}:end-->`;
const swap = (html: string, name: string, inner: string) =>
  html.replace(
    new RegExp(`<!--${name}:start-->[\\s\\S]*?<!--${name}:end-->`),
    block(name, inner),
  );

export default defineConfig({
  plugins: [
    {
      // Bake the head and the full portfolio content into index.html, for crawlers and no-JS visitors.
      name: "static-content",
      transformIndexHtml: (html) =>
        html
          .replace("<!--head-->", block("head", renderHead(PAGES[0])))
          .replace("<!--static-->", block("static", renderStatic("pt"))),
    },
    {
      // After the build: one HTML file per indexable page (/en, /curriculo, /resume), each with its own head,
      // language and baked content, plus the files robots and language models read.
      name: "seo-files",
      apply: "build",
      closeBundle() {
        const dist = resolve("dist");
        const index = readFileSync(resolve(dist, "index.html"), "utf8");
        for (const page of PAGES.slice(1)) {
          const t = ui[page.lang];
          let html = swap(index, "head", renderHead(page));
          html = swap(html, "static", renderStatic(page.lang));
          if (page.lang === "en")
            html = html
              .replace('<html lang="pt-BR">', '<html lang="en">')
              .replace(ui.pt.skip, t.skip)
              .replace(ui.pt.terminalView, t.terminalView);
          writeFileSync(resolve(dist, page.file), html);
        }
        const files: Record<string, string> = {
          "robots.txt": robotsTxt(),
          "sitemap.xml": sitemapXml(new Date().toISOString().slice(0, 10)),
          "llms.txt": llmsTxt(),
          "llms-full.txt": llmsFullTxt(),
          "resume.md": resumeMarkdown("en"),
          "curriculo.md": resumeMarkdown("pt"),
          "humans.txt": humansTxt(),
        };
        for (const [name, body] of Object.entries(files))
          writeFileSync(resolve(dist, name), body);
      },
    },
    {
      // In dev the game WebSocket (/ws) runs inside Vite's own server, so `pnpm dev` plays online too.
      // Not exclusive: Vite's hot-reload socket shares the server.
      name: "games",
      configureServer(server) {
        if (server.httpServer)
          attachGames(server.httpServer as Server, { exclusive: false });
      },
    },
  ],
});
