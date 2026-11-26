# TVR-PDF

Free, offline-first PDF reader and editor that runs entirely in the browser. No account, no backend, no uploads:
documents, annotations, signatures and passwords never leave your device.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173  (copies the OCR engine/language data into public/ocr first)
npm run build        # type-checks, then builds to dist/ (strict CSP + service worker)
npm run preview      # serve the production build
```

Requires Node 22+. Tests:

```bash
npm test             # unit + integration (Vitest, 46 tests)
npx playwright install chromium   # once
npm run test:e2e     # 16 end-to-end tests against the production build (port 4399)
npm run lint
```

## What it does

Read (virtualized rendering, zoom 25–400 %, fit width/page, view rotation, text selection, search, thumbnails, outline) ·
annotate (edit existing text lines, highlight, underline, strikethrough, freehand, text, sticky notes, rectangle, ellipse, line, arrow, stamps, eraser,
with color / opacity / thickness / font controls) · sign (draw, type or upload; vault of up to 5) ·
organize pages (reorder, delete, rotate, multi-select, insert/merge, extract, split) · fill existing form fields ·
OCR scans (Tesseract, English and Khmer bundled) · permanent redaction · compress images · export standard PDFs ·
links · form-field authoring · watermark / header / footer / page numbers · bookmarks · image insertion · crop and paper size · export pages as images · compare two PDFs · unlock and password-protect (qpdf) · autosave, crash recovery, recent documents, multiple document tabs · installable PWA that works offline.

See [`docs/CHECKLIST.md`](docs/CHECKLIST.md) for exactly what is verified, what is implemented but untested, and what is not done.

## Documentation

* [Architecture](docs/ARCHITECTURE.md) · [Security and privacy](docs/SECURITY.md) · [Annotation JSON format](docs/annotation-format.md)
* [Browser compatibility](docs/BROWSER-COMPATIBILITY.md) · [Known limitations](docs/KNOWN-LIMITATIONS.md)
* [Deployment](docs/DEPLOYMENT.md) · [Benchmarks](docs/BENCHMARKS.md) · [Checklist](docs/CHECKLIST.md)

## Version notes

Dependencies are semver-ranged in `package.json` and pinned by `package-lock.json`. Notable choices: PDF.js `pdfjs-dist` 6 (its worker is
bundled and loaded lazily), `pdf-lib` 1.17 (unmaintained but stable; it cannot read encrypted PDFs or garbage-collect objects, which shapes
the redaction and encryption behavior), `react-konva` for the annotation canvas, Zustand + Zundo for state and history, Dexie for IndexedDB,
`vite-plugin-pwa` (Workbox) for the service worker, `tesseract.js` 7 with self-hosted core and language data.
