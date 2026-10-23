import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: 'https://jefq-consultor.pages.dev',
  output: "static",
  compressHTML: true,
  trailingSlash: "always",
  integrations: [sitemap()]
});
