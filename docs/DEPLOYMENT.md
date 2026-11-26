# Deployment

The output of `npm run build` (`dist/`) is a static site. Host it anywhere that serves static files over **HTTPS** (required for service workers and installation).

1. `npm ci && npm run build` (the `prebuild` step copies OCR assets into `public/ocr`, so `node_modules` must be present).
2. Upload `dist/`. Configure the host to:
   * serve `index.html` for unknown paths (SPA fallback; the service worker also does this offline),
   * serve `.webmanifest` as `application/manifest+json` and `.mjs`/`.js` as JavaScript,
   * ideally send the CSP from `vite.config.ts` as an HTTP header (plus `frame-ancestors 'none'`); it is also embedded as a `<meta>` tag,
   * cache `assets/*` immutably and **never** cache `sw.js` or `index.html` long-term.
3. **Updates:** when a new build is deployed the service worker downloads it and the app shows "A new version is ready — Reload to update". Local data is unaffected (IndexedDB schema changes go through Dexie `version()` upgrades).
4. **Offline OCR:** the OCR engine (~4 MB) and language data (English 4 MB, Khmer ~1 MB uncompressed in `public/ocr`) are cached the first time OCR is used, not precached, to keep installs small. OCR therefore works offline only after it has been used once online.

Host-specific notes: Netlify/Vercel/Cloudflare Pages need no configuration beyond the SPA fallback; for nginx use `try_files $uri /index.html;`.
