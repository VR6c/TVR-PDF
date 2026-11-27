import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

/**
 * Strict CSP, applied to production builds (dev needs inline HMR scripts).
 * 'wasm-unsafe-eval' is required by PDF.js (JPEG2000/ICC) and Tesseract (WASM); no 'unsafe-eval' for JS.
 * connect-src has no remote origins, so document data cannot be sent anywhere even by a compromised dependency.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src blob:",
  "frame-src blob:",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const csp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    csp(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'TVR-PDF',
        short_name: 'TVR-PDF',
        description: 'Read, annotate, sign and organize PDFs entirely on your device.',
        theme_color: '#2563eb',
        background_color: '#f4f5f7',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [{ action: '/', accept: { 'application/pdf': ['.pdf'] } }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mjs,webmanifest,wasm}'],
        globIgnores: ['ocr/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        // OCR engine + language data and PDF.js CMap/font/ICC packs are large or optional: cached on first use.
        // PDF.js WASM decoders (public/pdfjs/wasm) match globPatterns above and are precached for offline scans.
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/ocr/'), handler: 'CacheFirst', options: { cacheName: 'ocr-assets', cacheableResponse: { statuses: [200] } } },
          { urlPattern: ({ url }) => url.pathname.startsWith('/pdfjs/'), handler: 'CacheFirst', options: { cacheName: 'pdfjs-assets', cacheableResponse: { statuses: [200] } } },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
})
