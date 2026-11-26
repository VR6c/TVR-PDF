// Copies the OCR engine and language data into public/ocr so OCR never touches a CDN.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const out = 'public/ocr'
mkdirSync(join(out, 'lang'), { recursive: true })
cpSync('node_modules/tesseract.js/dist/worker.min.js', join(out, 'worker.min.js'))
for (const f of readdirSync('node_modules/tesseract.js-core')) {
  if (/^tesseract-core.*lstm\.wasm\.js$/.test(f)) cpSync(join('node_modules/tesseract.js-core', f), join(out, f))
}
for (const lang of ['eng', 'khm']) {
  const src = `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`
  if (existsSync(src)) cpSync(src, join(out, 'lang', `${lang}.traineddata.gz`))
}
