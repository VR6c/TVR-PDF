// @vitest-environment node
import { PDFDocument } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decryptPdf, encryptPdf } from '../../src/lib/pdf/qpdf'

const require = createRequire(import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href
const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm')

async function plain() {
  const doc = await PDFDocument.create()
  doc.addPage([300, 200])
  doc.addPage([300, 200])
  return doc.save()
}

describe('qpdf: encrypted PDFs', () => {
  it('encrypts so that a password is required, then decrypts into something pdf-lib can edit', async () => {
    const enc = await encryptPdf(wasm, await plain(), 'sécret ✓')
    if (!enc.ok) throw new Error(enc.error.message)
    await expect(PDFDocument.load(enc.value)).rejects.toThrow() // pdf-lib refuses encrypted files

    const task = pdfjs.getDocument({ data: enc.value.slice() })
    await expect(task.promise).rejects.toMatchObject({ name: 'PasswordException' })
    const ok = await pdfjs.getDocument({ data: enc.value.slice(), password: 'sécret ✓' }).promise
    expect(ok.numPages).toBe(2)
    await ok.loadingTask.destroy()

    const dec = await decryptPdf(wasm, enc.value, 'sécret ✓')
    if (!dec.ok) throw new Error(dec.error.message)
    expect((await PDFDocument.load(dec.value)).getPageCount()).toBe(2)
  }, 30000)

  it('reports a wrong password instead of producing a file', async () => {
    const enc = await encryptPdf(wasm, await plain(), 'right')
    if (!enc.ok) throw new Error(enc.error.message)
    const r = await decryptPdf(wasm, enc.value, 'wrong')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('PASSWORD_INCORRECT')
  }, 30000)

  it('rejects input that is not a PDF', async () => {
    expect((await decryptPdf(wasm, new Uint8Array([1, 2, 3]), 'x')).ok).toBe(false)
  }, 30000)
})
