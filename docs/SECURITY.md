# Security and privacy

* **No network path for documents.** Production CSP: `default-src 'self'`; `connect-src 'self' blob: data:`;
  `script-src 'self' 'wasm-unsafe-eval'` (PDF.js and Tesseract need WASM; no `unsafe-eval`); `object-src blob:`
  and `frame-src blob:` (only for the print preview); `base-uri 'none'`; `form-action 'none'`. It ships as a `<meta>`
  tag; if your host can set headers, send the same policy as a header and add `frame-ancestors 'none'`
  (not possible via meta).
* **OCR data is self-hosted** (`public/ocr`, copied from npm packages at build). Nothing is fetched from a CDN.
* **No analytics, telemetry or remote logging.** Errors are shown, not reported; messages never include file names or contents.
* **Passwords** are used only to call PDF.js `getDocument` and are never stored or logged.
* **Imported annotation JSON is untrusted** and validated field by field before use; ids are regenerated.
* **Clear all local data** (Storage dialog) deletes documents, drafts, annotations, signatures, sessions and settings after an explicit confirmation.

## Permanent redaction

A black rectangle is *not* redaction, and the app says so. The flow:

1. The **Mark area for redaction** tool only places *markers*. Export refuses (`REDACTION_UNSAFE`) while markers exist.
2. **Apply** rasterizes each affected page, paints the regions black in the pixels, and builds a **new** PDF from the
   untouched pages (copied) plus the image pages. Old page objects are not carried over, so the covered text, fonts and
   vector content are absent from the file bytes (pdf-lib never garbage-collects, so editing in place would leak them).
3. Undo history is cleared afterwards so the pre-redaction bytes aren't retained.

Verified by tests: the secret string is absent from the raw bytes, PDF.js text extraction returns nothing for the page,
and the rendered region is black. **Trade-offs:** a redacted page becomes non-selectable, non-searchable image content, and
document-level outline/metadata of the rebuilt file are not preserved. Pages with no marks are untouched. Redaction is unavailable for encrypted PDFs.
