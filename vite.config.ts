import { defineConfig } from "vite";
import { renderStatic } from "./src/static.ts";

export default defineConfig({
  plugins: [
    {
      // Bake the full portfolio content into index.html for crawlers and no-JS visitors.
      name: "static-content",
      transformIndexHtml: (html) =>
        html.replace("<!--static-->", renderStatic("pt")),
    },
  ],
});
