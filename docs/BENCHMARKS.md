# Benchmarks (measured, not targets)

Device: Intel(R) Core(TM) i7-8559U CPU @ 2.70GHz, 8 cores, 16 GB RAM, darwin 24.6.0, headless Chromium via Playwright.
Document: generated, 500 pages × ~40 text lines (0.51 MB).

| Metric | Result |
|---|---|
| File chosen → first page text visible | 936 ms |
| Jump from page 1 to page 400 until its text is visible | 347 ms |
| Canvases holding pixels after the jump (virtualization) | 17 of 500 pages |
| JS heap | 28 MB |

Run `npx playwright test -g benchmark` to regenerate. The 150 ms single-page target is not asserted here.
