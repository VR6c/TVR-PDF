# Architecture

Client-only React + TypeScript app. There is no backend: `connect-src` in the production CSP allows
only same-origin, `blob:` and `data:`.

```
src/
  components/   Presentation: layout, toolbar, sidebar, pdf (viewer), annotations (Konva layer), dialogs
  stores/       Zustand state: document (undoable), viewer, tools, signatures, ocr, notice, ui, opener, theme
  lib/
    geometry/   page ⇄ viewport transform (the only place rotation/zoom maths lives)
    annotations style patches, JSON import/export + validation, stamp metrics
    pdf/        engine (PDF.js open/outline/search), pageOps, export (pdf-lib), redact, compress, forms, worker client
    storage/    Dexie schema, repositories, settings
    session.ts  open/close/tabs;  autosave.ts debounce + compare-and-set draft saves
  workers/      pdf.worker.ts — pdf-lib operations off the main thread
  types/        contracts: ids, geometry, errors (Result), annotations, pdf-engine, export, persistence
```

## Key decisions

* **One coordinate space is persisted**: PDF page units, unrotated, top-left origin. Viewport/Konva space is
  derived (`lib/geometry/transform.ts`). Konva draws a `Group` whose transform *is* page→viewport, so shapes use
  page coordinates directly and stroke widths scale with zoom. Tests render exported PDFs and assert pixels land
  where the transform predicts at all four rotations.
* **Annotations belong to a `PageId`, not a page index**, so reorder/delete can't orphan them.
* **The working PDF is rebuilt on structural edits** (reorder, delete, rotate, insert, form fill, redaction).
  Annotations stay separate and are only flattened into PDF content at export. The viewer always renders the
  current working PDF, so there is one source of truth. Page edits are therefore one undo step each, and undo
  restores the previous bytes.
* **Undo/redo** uses Zundo over `{baseBytes, pages, annotations}` (limit 50). `beginGesture/commitGesture`
  collapse continuous edits into one step.
* **Errors**: expected failures return `Result<T, AppError>` with a stable `code`; the UI maps codes to messages.
* **Persistence**: Dexie tables `documents` (metadata + annotations + page list), `files` (PDF bytes, kept apart so
  list views stay cheap), `signatures`, `documentSessions`, `settings`. Drafts use a revision compare-and-set so a
  stale tab cannot overwrite a newer draft (`DRAFT_CONFLICT`). Quota errors map to `STORAGE_QUOTA_EXCEEDED` and the
  document stays viewable.
* **Workers**: pdf-lib work (assemble, export, form fill) runs in `pdf.worker.ts`; PDF.js uses its own worker;
  OCR uses Tesseract's worker. Rasterizing pages for redaction/OCR happens on the main thread (canvas), page by page.
* **Lazy loading**: PDF.js, the viewer, Konva, pdf-lib and every dialog are separate chunks; the initial bundle is the shell.
* **Tabs** are autosaved documents; switching reloads from IndexedDB (undo history is per session, not per tab).
