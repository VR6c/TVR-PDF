# TVR-PDF

Free, offline-first PDF reader and editor that runs entirely in the browser. No account, no backend, no uploads:
documents, annotations, signatures and passwords never leave your device.

## Quick start

Requires **Node 22+**.

```bash
npm install
npm run dev          # http://localhost:5173  (copies OCR assets into public/ocr first)
npm run build        # copies OCR assets, type-checks (tsc -b), builds to dist/ (strict CSP + service worker)
npm run preview      # serve the production build
```

Checks and tests:

```bash
npm test             # unit + integration (Vitest, 79 tests)
npx playwright install chromium   # once
npm run test:e2e     # 22 end-to-end tests against the production build (port 4399)
npm run lint         # oxlint
```

## Project layout

```text
src/components/   React UI: annotations, common (modal, menu, opener dialogs), dialogs, layout, pdf viewer, sidebar, toolbar
src/hooks/        Viewport virtualization observer and keyboard shortcuts
src/lib/          PDF engine/export/redact/compress/forms/qpdf, annotations (JSON I/O, stamps, images, style), storage (Dexie), autosave, compare, zip, geometry
src/stores/       Zustand stores (document, extras, notice, ocr, opener, signatures, theme, tools, ui, viewer)
src/workers/      Web Worker for pdf-lib and qpdf-wasm operations
src/types/        Shared TypeScript contracts
src/pwa.ts        PWA install prompt and Workbox service-worker registration
public/           App icons, favicon, and generated OCR engine/language assets (public/ocr)
scripts/          OCR asset copy (copy-ocr-assets.mjs) and icon generation (make-icons.mjs)
tests/            Unit, integration (Vitest) and e2e (Playwright) tests
docs/             Architecture, security, deployment, compatibility, benchmarks and checklist
vercel.json       Static hosting rewrites and security/cache headers
```

## What it does

* **Read & navigate**: virtualized page rendering, zoom 25–400 %, fit width / fit page, view rotation, text selection, document search with on-page match highlights, thumbnails, PDF outline, user bookmarks (written into the exported outline), light/dark mode, and keyboard shortcuts (`Ctrl/Cmd+O`, `F`, `S`, `P`, `Z`/`Shift+Z`/`Y`, `Esc`, `Delete`/`Backspace`).
* **Annotate & edit**: highlight, underline, strikethrough, freehand pen, text boxes, edit existing text lines (covers the line with sampled background color and draws replacement text; non-Latin/Khmer text shapes via browser canvas on export), sticky notes (exported as PDF `/Text` annotations), rectangle and ellipse (with optional fill), line, arrow, stamps (`APPROVED`, `CONFIDENTIAL`, `DRAFT`, `PAID`), image insertion (PNG/JPEG/WebP/GIF), clickable links (URL/`mailto:` or jump-to-page), eraser; color, opacity, thickness, font, and alignment controls; undo/redo with gesture grouping; and validated annotation JSON import/export (`schemaVersion` 1).
* **Sign**: draw, type (script fonts), or upload (PNG/JPG up to 2 MB) signatures, stored in a local vault of up to 5.
* **Organize & modify pages**: drag-and-drop reorder, delete, rotate, multi-select, insert/combine PDFs (including multi-file combine on open), insert blank pages, convert images to pages, extract selected pages or ranges, split by range, crop (mm margins, shifting annotations to match), and change paper size (`A4`, `A3`, `A5`, `Letter`, `Legal`).
* **Forms**: fill existing AcroForm fields (text, checkbox, radio, dropdown) and author new form fields (text, checkbox, dropdown) exported as real AcroForm widgets.
* **OCR & compare**: offline OCR for scans (`tesseract.js`, English and Khmer bundled) with copyable results and an invisible searchable Latin text layer on export; page-by-page PDF comparison (text line diff and pixel diff).
* **Redaction, encryption & export**: permanent redaction (rasterizes marked pages with blacked-out pixels and strips underlying text/objects from the rebuilt PDF, clearing undo history); open password-protected PDFs, unlock an unencrypted working copy for editing, and password-protect exports with AES-256 (`qpdf`); export standard PDFs with optional lossy JPEG image compression, metadata editing or stripping, watermarks, headers, footers, and page numbers; export pages as PNG/JPEG images (72–300 DPI, zipped when multi-page); print; and save via the native File System Access picker with download fallback.
* **Offline PWA & local storage**: autosave to IndexedDB (`Dexie`) with compare-and-set draft conflict protection, crash/session recovery, recent documents, multiple document tabs, storage usage inspection and full local wipe, and an installable Workbox PWA with OS PDF `file_handlers` and strict CSP (no remote `connect-src`).

See [`docs/CHECKLIST.md`](docs/CHECKLIST.md) for verification status and scope notes.

## Documentation

* [Architecture](docs/ARCHITECTURE.md) · [Security and privacy](docs/SECURITY.md) · [Annotation JSON format](docs/annotation-format.md)
* [Browser compatibility](docs/BROWSER-COMPATIBILITY.md) · [Known limitations](docs/KNOWN-LIMITATIONS.md)
* [Deployment](docs/DEPLOYMENT.md) · [Benchmarks](docs/BENCHMARKS.md) · [Checklist](docs/CHECKLIST.md)

## Version notes

Dependencies are semver-ranged in `package.json` and pinned by `package-lock.json`. Notable choices:

* **PDF & WASM**: PDF.js (`pdfjs-dist` 6, worker bundled and loaded lazily), `pdf-lib` 1.17 (unmaintained but stable; cannot read encrypted PDFs or garbage-collect objects, which shapes the redaction and encryption behavior), and `@neslinesli93/qpdf-wasm` 0.3 for WebAssembly decryption and AES-256 encryption.
* **OCR**: `tesseract.js` 7 with self-hosted core and `eng` / `khm` language data copied into `public/ocr/` at dev/build time.
* **UI, canvas & state**: React 19, Tailwind CSS 4, `konva` 10 / `react-konva` 19, Zustand 5 + Zundo 2 for undoable state, and Dexie 4 for IndexedDB.
* **Build & tooling**: Vite 8, `vite-plugin-pwa` 2 (Workbox), TypeScript ~7.0, Vitest 5, Playwright, and `oxlint`.
