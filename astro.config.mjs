import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

const legacyStyleAliases = new Set([
  "/styles/lego/",
  "/styles/studio-ghibli/",
]);

export default defineConfig({
  site: "https://prompt-atlas.ldktech.com",
  output: "static",
  integrations: [sitemap({
    filter: (page) => !legacyStyleAliases.has(new URL(page).pathname),
  })],
  prefetch: false,
  build: {
    inlineStylesheets: "auto",
  },
});
