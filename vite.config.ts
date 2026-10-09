import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { relative, resolve } from "node:path";
import { defineConfig } from "vite";
import { attachGames } from "./server/games.ts";
import { handleScores } from "./server/scores.ts";
import { resumeAnsi } from "./src/ansi.ts";
import { ui } from "./src/i18n.ts";
import { manifest, serviceWorker } from "./src/pwa.ts";
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

/** The dev server's game rooms, for the lobby API. */
let games: ReturnType<typeof attachGames> | null = null;

export default defineConfig({
  // 5173 is Vittz's web, 5000 its API and 5174 iFleetHub's: a port of its own keeps their logins and storage apart (same origin).
  server: { port: 5001, strictPort: true },
  preview: { port: 5002, strictPort: true },
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
          // `curl phas.dev`: the server answers terminals with these.
          "curriculo.ans": resumeAnsi("pt"),
          "resume.ans": resumeAnsi("en"),
        };
        for (const [name, body] of Object.entries(files))
          writeFileSync(resolve(dist, name), body);

        // Offline mode: the manifest, then a service worker that keeps the pages (fetched by address) and
        // the files they use; not the ones only robots and sharing read.
        writeFileSync(resolve(dist, "manifest.webmanifest"), manifest());
        const all = readdirSync(dist, { recursive: true, withFileTypes: true })
          .filter((f) => f.isFile())
          .map((f) => "/" + relative(dist, resolve(f.parentPath, f.name)));
        const keep = all.filter(
          (f) =>
            /\.(js|css|woff2|svg|png|webmanifest)$/.test(f) &&
            f !== "/og.png" &&
            f !== "/sw.js",
        );
        const version = createHash("sha256");
        for (const f of all
          .filter((f) => keep.includes(f) || f.endsWith(".html"))
          .sort())
          version.update(f).update(readFileSync(resolve(dist, f.slice(1))));
        writeFileSync(
          resolve(dist, "sw.js"),
          serviceWorker(version.digest("hex").slice(0, 12), keep.sort()),
        );
      },
    },
    {
      // In dev the game WebSocket (/ws) runs inside Vite's own server, so `pnpm dev` plays online too.
      // Not exclusive: Vite's hot-reload socket shares the server.
      name: "games",
      configureServer(server) {
        // The leaderboards' API too, so solo games can post scores in development.
        server.middlewares.use((req, res, next) => {
          const path = new URL(req.url ?? "/", "http://x").pathname;
          if (path === "/manifest.webmanifest") {
            res.setHeader("Content-Type", "application/manifest+json");
            res.end(manifest());
            return;
          }
          if (path === "/api/lobby") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(games?.lobby() ?? {}));
            return;
          }
          if (!handleScores(req, res, path, "dev")) next();
        });
        if (server.httpServer)
          games = attachGames(server.httpServer as Server, {
            exclusive: false,
          });
      },
    },
  ],
});
