import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://example.com', // Override per customer
  integrations: [sitemap()],
  output: 'static',
  build: {
    assets: 'assets'
  }
});
