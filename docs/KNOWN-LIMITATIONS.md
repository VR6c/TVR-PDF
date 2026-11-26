# Known limitations

**Encryption.** Password-protected PDFs open and can be viewed and annotated, but pdf-lib cannot read or write encrypted files, so
**export, page editing, form filling and redaction stay disabled until you choose "Unlock for editing"** (⋯ menu, needs the password). That uses qpdf (WebAssembly, in a worker) to make an unencrypted *working copy*; the copy autosaved on this device is then **not** password-protected, and your original file is untouched. On export, "Protect with a password" re-encrypts with AES-256 (the same password is used as user and owner password; no permission restrictions are set). Digital signatures in the source are invalidated by editing.

**Redaction.** Implemented by rasterizing affected pages (see SECURITY.md). Redacted pages lose selectable/searchable text, the rebuilt file drops
document-level outline and metadata, and undo history is cleared. Redaction marks only exist as markers until applied.

**Export fidelity.**
* Annotation text uses the standard PDF fonts (Helvetica/Times/Courier, WinAnsi). Text boxes and edited text containing **Khmer or other non-Latin characters** are drawn with the browser's own shaping and embedded as images, so they look right but are **not selectable or searchable** in the exported PDF (and use whatever Khmer font the device has). Headers, footers, watermarks and page numbers are Latin only (other characters become `?`).
* Highlights use a multiply blend, as on screen.
* Sticky notes export as real PDF text annotations (icon + popup text); other annotations are flattened into page content and can't be edited in other viewers.
* OCR text is embedded as fully transparent Latin text. Khmer OCR works on screen (result preview) but is not embedded as PDF text.
* Text-box and stamp layout uses font metrics approximations; line breaks can differ slightly from the on-screen preview.

**Images / compression.** Only embedded JPEG (DCTDecode) RGB/Gray images are downsampled; other image encodings are left alone. Compression is lossy and may not shrink every file.

**Forms.** Text, checkbox, radio and dropdown fields of an existing AcroForm can be filled (values are applied to the file, regenerating appearances). No form authoring, no list boxes/signature fields, no XFA.

**Digital signatures.** "Signatures" are images placed on the page. Cryptographic/certificate signing (as in Acrobat) is not implemented.

**Editing existing content.** The page's own content stream is never rewritten. The *Edit text* tool replaces a line by covering it with the sampled background color and drawing new text (standard fonts only, no reflow, unrotated pages only); the original text stays in the file under the cover unless the area is also redacted. Images cannot be edited.

**Search.** Matches are highlighted on the page when they sit inside one text run; a match that spans runs is listed but not highlighted. Search is plain case-insensitive substring.

**Bookmarks.** The sidebar shows the PDF's own outline (its bookmarks). User bookmarks (Bookmarks tab) are stored per document in this browser's localStorage, not in the document database, and are written into the PDF outline on export; they are appended after the PDF's own bookmarks, top level only.

**Tabs.** Each tab is an autosaved document; switching reloads it from IndexedDB, so undo history is not kept per tab. OCR results are session-only.

**Mobile/tablet.** The properties panel is hidden below ~1024 px, so colors/thickness can't be changed on small screens (tool defaults apply). The toolbar is a scrollable top bar rather than a bottom action bar. Pinch-zoom uses the browser's own zoom; there are no custom gestures.

**Resizing/rotating annotations** uses Konva's transformer; endpoints of lines/arrows can be moved as a whole but not individually edited.

**Accessibility.** Labels, keyboard-operable dialogs and reduced-motion support are in place, but the canvas annotation tools are pointer-driven and there has been no screen-reader or high-contrast audit.

**Persistence.** Large PDFs are stored whole in IndexedDB (no chunking); the app reports quota errors but a very large file may fail to persist (it stays viewable). Form values entered in the sidebar but not applied are not saved.

**Images and cropping.** *Add image* stores the picture (downscaled to 1600 px, PNG or JPEG) inside the annotation, so it is saved with the document and included in annotation JSON exports (large files). Images can be moved, resized and rotated, but not cropped or recolored. *Crop* sets the page's CropBox (the rest of the page stays in the file, as in Acrobat's crop) and shifts existing annotations so they stay on the same content. Resizing pages to a new paper size is not implemented.

**Links, form fields, paper size.** Links are drawn as areas and exported as real link annotations (web, mailto or jump-to-page only; other schemes are dropped). Form fields created with the Form field tool are real AcroForm text boxes, checkboxes and dropdowns with default styling; no radio buttons, list boxes, validation or calculations. *Set size* changes paper size without scaling content (top-left stays fixed), unlike Acrobat's scale-to-fit.

**Compare.** Compares the open document with another PDF page by page (same page numbers): changed text lines and a pixel diff at fixed width. It does not detect moved pages, and password-protected files can't be compared. Annotations are not part of the comparison.

**Export as images.** Renders the edited document (annotations included) at 72–300 DPI to PNG/JPEG; several pages come as an uncompressed ZIP.

**Not implemented (by design).** Certificate-based digital signatures, reflowing editing of existing text, PDF/A and accessibility tagging, and conversion to/from Word, Excel or PowerPoint (these need server-side software to be any good).
