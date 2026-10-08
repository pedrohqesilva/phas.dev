import type { Server } from "node:http";
import { defineConfig } from "vite";
import { attachGames } from "./server/games.ts";
import { renderStatic } from "./src/static.ts";

export default defineConfig({
  plugins: [
    {
      // Bake the full portfolio content into index.html for crawlers and no-JS visitors.
      name: "static-content",
      transformIndexHtml: (html) => html.replace("<!--static-->", renderStatic("pt")),
    },
    {
      // In dev the game WebSocket (/ws) runs inside Vite's own server, so `pnpm dev` plays online too.
      // Not exclusive: Vite's hot-reload socket shares the server.
      name: "games",
      configureServer(server) {
        if (server.httpServer) attachGames(server.httpServer as Server, { exclusive: false });
      },
    },
  ],
});
