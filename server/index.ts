// phas.dev server: the static site (dist/) and the game WebSocket (/ws) on one port.
// Static files are read once at startup and kept in memory, gzipped when that helps. Hashed assets are
// cached for a year; everything else is revalidated. Unknown paths fall back to index.html, so /simples
// and other client routes work on reload.
import { readdirSync, readFileSync, statSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { attachGames } from "./games.ts";

const PORT = Number(process.env.PORT ?? 8080);
const DIST = resolve(process.env.DIST ?? "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
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

function serveStatic(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (path === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }
  const file =
    files.get(path === "/" ? "/index.html" : path) ?? files.get("/index.html");
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  const gzip =
    file.gzip && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  const body = gzip ? file.gzip! : file.body;
  res.writeHead(200, {
    "Content-Type": file.type,
    "Content-Length": body.length,
    "Cache-Control": path.startsWith("/assets/")
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff",
    ...(gzip ? { "Content-Encoding": "gzip" } : {}),
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

const server = createServer(serveStatic);
attachGames(server);

server.listen(PORT, () =>
  console.log(`phas.dev on :${PORT} (${files.size} static files)`),
);
