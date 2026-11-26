# Feature checklist

Legend: **Verified** = covered by an automated test that passes (Vitest unit/integration, or Playwright in Chromium).
**Implemented** = built and type-checked, but no automated test exercises it end to end. **Not done** = absent.
Last full run: 46 unit/integration tests + 16 Playwright tests passing, `tsc -b` clean, production build succeeds.

| Req | Status | Notes |
|---|---|---|
| FR-01 open: drag-drop, picker | Verified (picker), Implemented (drag-drop, multi-file import) | |
| FR-01 File System Access / file_handlers | Implemented | Only the download fallback is tested; not run in a real installed PWA |
| FR-01 recents, autosave, draft recovery | Verified | Scenario 7 |
| FR-01 invalid/corrupt PDF, quota errors | Verified (quota, corrupt-bytes unit); Implemented (invalid-file banner) | |
| FR-02 rendering, virtualization, zoom, fit, rotate view | Verified (render, virtualization via benchmark); Implemented (zoom/fit/rotate controls) | |
| FR-02 text selection, search, thumbnails, outline | Implemented | Search has no on-page highlight |
| FR-02 shortcuts (O, S, F, Z, Shift+Z, P, Esc, Del) | Implemented | Only undo button state tested |
| FR-03 annotations: highlight, text, freehand, rectangle | Verified | E2E 2, 3, 6, 7 |
| FR-03 underline, strike, ellipse, line, arrow, stamp, note, eraser | Verified at export level (every type exported + re-opened); Implemented in UI | |
| FR-03 coordinate system / rotation sync | Verified | Pixel-level tests at 0/90/180/270 |
| FR-03 undo/redo with gesture grouping | Verified (store tests) | |
| FR-04 signatures: draw | Verified (E2E 4, placement on page 3, vault persists reload) | |
| FR-04 type, upload, vault limit 5 | Implemented (limit Verified in unit tests) | |
| FR-05 reorder, delete | Verified (E2E 5, 6) | |
| FR-05 rotate, multi-select, insert/merge, extract, split | Verified at library level; Implemented in UI | Range parsing unit-tested |
| FR-06 OCR | Verified (English scan → searchable text in export) | Khmer not tested |
| FR-06 compression | Verified (JPEG downsample in browser) | Other image types untouched |
| FR-07 export (all annotation types, deletions, reorder, rotation, OCR layer) | Verified | Opened with pdf-lib and PDF.js; **not** opened in Acrobat/Preview |
| FR-07 Save As via native picker, print | Implemented | Print not testable headless |
| FR-08 password PDFs | Implemented | No encrypted fixture/test; export blocked for encrypted |
| FR-09 form filling | Verified (text field); checkbox Verified at library level; radio/dropdown Implemented | |
| FR-10 properties | Implemented | |
| FR-11 annotation JSON import/export | Verified (validation, round trip) | |
| FR-12 storage management, clear all | Verified (repository wipe); Implemented (UI) | |
| FR-13 crash recovery | Verified (reload recovers); compare-and-set Verified | No "incomplete operation" detection beyond that |
| FR-14 accessibility | Partial | See limitations |
| FR-15 printing | Implemented | |
| FR-16 tabs | Implemented | |
| Permanent redaction | Verified | E2E 10 + library tests: bytes, text extraction, pixels |
| CSP, no network exfiltration | Verified | E2E 9 under the production CSP; no non-origin or non-GET requests |
| Offline PWA | Verified | E2E 8 reloads offline and reopens from IndexedDB |
| Install prompt, update flow | Implemented | |
| Firefox, Safari, mobile browsers | **Not tested** | |
| Performance targets (150 ms page render, FCP 1.2 s) | **Not measured** | See BENCHMARKS.md for what was measured; initial bundle 112 kB gzip (JS) |
| Dedicated redaction of vector/image content without rasterizing | Not done | By design — see SECURITY.md |
