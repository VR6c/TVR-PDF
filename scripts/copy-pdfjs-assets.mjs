// Copies PDF.js WASM decoders, CMaps, standard fonts, and ICC profiles into public/pdfjs
// so scanned (CCITT/JBIG2/JPEG2000) and non-embedded-font PDFs render offline without a CDN.
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/pdfjs'
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const dir of ['wasm', 'cmaps', 'standard_fonts', 'iccs']) {
  cpSync(join('node_modules/pdfjs-dist', dir), join(out, dir), { recursive: true })
}
