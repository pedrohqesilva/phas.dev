// phas.dev server: the static site (dist/) and the game WebSocket (/ws) on one port.
// Static files are read once at startup and kept in memory, gzipped when that helps. Hashed assets are
// cached for a year; everything else is revalidated. Each page address gets its own built HTML (see ROUTES);
// unknown paths still get the terminal, with a 404 status.
import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { attachGames } from "./games.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DIST = resolve(process.env.DIST ?? "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".md": "text/markdown; charset=utf-8",
};

/**
 * Addresses that are pages of the app, and the built HTML each one gets: every language and view has its own
 * file (head, content and language baked in). Anything else that is not a file is a real 404.
 */
const ROUTES: Record<string, string> = {
  "/": "/index.html",
  "/en": "/en.html",
  "/curriculo": "/curriculo.html",
  "/resume": "/resume.html",
  // Older and alternative addresses of the resume; their canonical link points at the two above.
  "/simples": "/curriculo.html",
  "/cv": "/curriculo.html",
  "/simple": "/resume.html",
  // Games open straight away over the terminal.
  "/snake": "/index.html",
  "/cobrinha": "/index.html",
  "/invaders": "/index.html",
};

type File = { body: Buffer; gzip: Buffer | null; type: string };

function loadDist(): Map<string, File> {
  const files = new Map<string, File>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else {
        const body = readFileSync(path);
        const type = TYPES[extname(name)] ?? "application/octet-stream";
        const compressible =
          /^(text\/|image\/svg|application\/(json|xml|manifest))/.test(type);
        const gzip = compressible && body.length > 512 ? gzipSync(body) : null;
        files.set(`/${relative(DIST, path).split("\\").join("/")}`, {
          body,
          gzip,
          type,
        });
      }
    }
  };
  try {
    walk(DIST);
  } catch {
    console.warn(
      `no static files at ${DIST} (fine in dev: Vite serves the site)`,
    );
  }
  return files;
}

const files = loadDist();

/**
 * Content Security Policy: only this site's own files run. The one inline script (theme and language before
 * first paint) is allowed by its hash, computed here from the built pages, so editing it never breaks the
 * policy. JSON-LD blocks are data, not scripts, and need no hash.
 */
const inlineScriptHashes = [
  ...new Set(
    [...files]
      .filter(([path]) => path.endsWith(".html"))
      .flatMap(([, file]) => [
        ...file.body
          .toString("utf8")
          .matchAll(
            /<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>([\s\S]*?)<\/script>/g,
          ),
      ])
      .map(
        (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
      ),
  ),
];
const CSP = [
  "default-src 'self'",
  // Cloudflare Web Analytics (cookieless) is injected at the edge: its beacon script and where it reports.
  `script-src 'self' ${inlineScriptHashes.join(" ")} https://static.cloudflareinsights.com`,
  // Inline styles: the first-paint colours in the HTML and the styles the terminal sets on the fly.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // The game WebSocket.
  "connect-src 'self' wss://phas.dev https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/**
 * Pages may be kept at the edge (Cloudflare) for a few minutes, while browsers always revalidate: a deploy
 * shows up within minutes everywhere. Hashed assets never change, so they are kept for a year.
 */
const cacheControl = (path: string, status: number) =>
  path.startsWith("/assets/")
    ? "public, max-age=31536000, immutable"
    : status === 200
      ? "public, max-age=0, s-maxage=300, stale-while-revalidate=60"
      : "no-cache";

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  // One address for the site: www goes to the apex, keeping the path (one URL per page for search engines).
  const host = String(req.headers.host ?? "");
  if (host.startsWith("www.")) {
    res
      .writeHead(301, {
        Location: `https://${host.slice(4)}${req.url ?? "/"}`,
        ...SECURITY_HEADERS,
      })
      .end();
    return;
  }
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  const route = ROUTES[path.replace(/(.)\/$/, "$1").toLowerCase()];
  const asset = route ? undefined : files.get(path);
  // Unknown address: the terminal still opens (it may be an old link), but with a 404 status for robots.
  const file = asset ?? files.get(route ?? "/index.html");
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  const status = asset || route ? 200 : 404;
  const gzip =
    file.gzip && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  const body = gzip ? file.gzip! : file.body;
  res.writeHead(status, {
    "Content-Type": file.type,
    "Content-Length": body.length,
    "Cache-Control": cacheControl(path, status),
    Vary: "Accept-Encoding",
    ...SECURITY_HEADERS,
    ...(gzip ? { "Content-Encoding": "gzip" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const server = createServer(serveStatic);
attachGames(server);

server.listen(PORT, () =>
  console.log(`phas.dev on :${PORT} (${files.size} static files)`),
);

/**
 * IndexNow: after a deploy, tell Bing and the other IndexNow engines that the pages changed, instead of
 * waiting for their next crawl. The key is the public `<key>.txt` file in dist (it proves the site is ours).
 * Only in Railway's production, a minute after start so the new deploy is the one answering.
 */
const SITE = "https://phas.dev";
const INDEXNOW_URLS = [
  "/",
  "/en",
  "/curriculo",
  "/resume",
  "/llms.txt",
  "/resume.md",
  "/curriculo.md",
];
const indexNowKey = [...files.keys()]
  .map((path) => /^\/([a-f0-9]{32})\.txt$/.exec(path)?.[1])
  .find(Boolean);

async function pingIndexNow(key: string) {
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: new URL(SITE).host,
        key,
        keyLocation: `${SITE}/${key}.txt`,
        urlList: INDEXNOW_URLS.map((path) => SITE + path),
      }),
    });
    console.log(`indexnow: ${res.status} for ${INDEXNOW_URLS.length} urls`);
  } catch (error) {
    console.warn("indexnow: failed", error);
  }
}

if (indexNowKey && process.env.RAILWAY_ENVIRONMENT_NAME === "production")
  setTimeout(() => pingIndexNow(indexNowKey), 60_000).unref();
