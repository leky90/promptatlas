import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://prompt-atlas.ldktech.com",
  output: "static",
  integrations: [sitemap()],
  prefetch: false,
  build: {
    inlineStylesheets: "auto",
  },
});
