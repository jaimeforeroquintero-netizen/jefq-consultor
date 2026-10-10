import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: 'https://jefq-consultor.vercel.app',
  output: "static",
  compressHTML: true,
  trailingSlash: "never",
  integrations: [sitemap()]
});
