# Browser compatibility

Automated tests run in **Chromium (headless)** only. Other browsers are targeted but **not yet verified** by this repo's tests.

| Feature | Chrome / Edge | Firefox | Safari / iOS Safari | Fallback |
|---|---|---|---|---|
| Rendering, annotation, signatures, page tools, export | ✔ (tested) | expected | expected | — |
| File System Access (`showSaveFilePicker`) | ✔ | ✘ | ✘ | Browser download |
| PWA install prompt (`beforeinstallprompt`) | ✔ | ✘ | Add to Home Screen (manual) | Runs in a tab |
| PWA `file_handlers` | ✔ (desktop, installed) | ✘ | ✘ | Open button / drag and drop |
| `navigator.storage.estimate` | ✔ | ✔ | partial | Dialog says usage is unavailable |
| OffscreenCanvas in workers (image compression) | ✔ | ✔ | ≥ 16.4 | Compression skipped for images |
| Print | iframe print | iframe print | may open the PDF in a tab | Use the viewer's own print |

Notes: storage quotas differ per browser (Safari evicts data of sites not used for ~7 days unless installed to the Home Screen);
iOS Safari has tight per-tab memory limits for very large PDFs; touch drawing uses pointer events with `touch-action: none` only while a drawing tool is active.
