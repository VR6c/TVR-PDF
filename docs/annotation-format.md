# Annotation JSON format (schemaVersion 1)

Exported from **More ▸ … ▸ Import / export annotations**. Imports are validated by
`src/lib/annotations/io.ts` before anything is applied; the whole file is rejected if any annotation
is invalid. Imported ids are regenerated, so an import can never overwrite existing annotations.

```jsonc
{
  "schemaVersion": 1,
  "exportedAt": "2026-11-26T08:00:00.000Z",
  "pageCount": 4,
  "annotations": [
    { "type": "line", "pageIndex": 0, "zIndex": 1, "start": {"x": 0, "y": 0}, "end": {"x": 90, "y": 90},
      "style": {"color": "#e11d48", "opacity": 1, "width": 2} }
  ]
}
```

* **Coordinates** are PDF page units (1/72 in), origin at the **top-left of the unrotated page**, y down.
  They do not depend on zoom, window size or rotation.
* **Pages** are referenced by 0-based `pageIndex` and remapped to the target document's pages on import.
* **Colors** are `#rrggbb`; **opacity** is 0..1; `rotation` is degrees clockwise about the top-left of `bounds`.
* Types: `highlight`/`underline`/`strikethrough` (`quads`, `color`, `opacity`), `freehand` (`points`, `style`),
  `rectangle`/`ellipse` (`bounds`, `rotation`, `stroke`, `fill|null`), `line`/`arrow` (`start`, `end`, `style`),
  `text` (`bounds`, `rotation`, `text`, `style`), `note` (`position`, `text`, `color`),
  `stamp` (`stamp`: APPROVED|CONFIDENTIAL|DRAFT|PAID, `bounds`, `rotation`),
  `signature` (`signatureId`, `bounds`, `rotation`), `redaction` (`bounds`, a *marker* until applied).
* `signature` annotations reference a signature in the local vault by id; image data is **not** in the file.
* Limits: ≤ 20 000 annotations, ≤ 100 000 points per stroke, file ≤ 20 MB.

Breaking changes bump `schemaVersion`; additions are optional fields.
