import { defineConfig } from "vite";
import { renderStatic } from "./src/static.ts";

export default defineConfig({
  // In dev the game server runs apart (pnpm dev:server, port 8787); in production one server does both.
  server: { proxy: { "/ws": { target: "ws://localhost:8787", ws: true } } },
  plugins: [
    {
      // Bake the full portfolio content into index.html for crawlers and no-JS visitors.
      name: "static-content",
      transformIndexHtml: (html) =>
        html.replace("<!--static-->", renderStatic("pt")),
    },
  ],
});
