// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Static output, served from S3 behind CloudFront.
// trailingSlash 'always' + directory format means every page is /path/index.html.
// CloudFront needs the rewrite function in infra/cloudfront-rewrite.js to resolve those.
export default defineConfig({
  site: 'https://observedstate.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [sitemap()],
});
