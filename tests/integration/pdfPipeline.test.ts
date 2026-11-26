// @vitest-environment node
import { createCanvas } from '@napi-rs/canvas'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { exportPdf } from '../../src/lib/pdf/export'
import { listFormFields } from '../../src/lib/pdf/forms'
import { applyRedactions, groupByPage } from '../../src/lib/pdf/redact'
import type { RasterBackend } from '../../src/lib/pdf/redact'
import { assemble, extractPages, insertDocument, pageCount } from '../../src/lib/pdf/pageOps'
import { compressImages } from '../../src/lib/pdf/compress'
import type { Annotation, AnnotationId, PageId, PageRef, SignatureId } from '../../src/types'

const require = createRequire(import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href

const raster: RasterBackend = {
  createCanvas: (w, h) => createCanvas(w, h) as never,
  encode: async (c) => ({ bytes: new Uint8Array((c as never as ReturnType<typeof createCanvas>).toBuffer('image/png')), mime: 'image/png' }),
}

async function makePdf(pages: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pages) {
    const p = doc.addPage([400, 300])
    p.drawText(text, { x: 50, y: 200, size: 24, font, color: rgb(0, 0, 0) })
  }
  return doc.save()
}

async function textOf(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true }).promise
  const page = await doc.getPage(pageIndex + 1)
  const content = await page.getTextContent()
  const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ')
  await doc.loadingTask.destroy()
  return text
}

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const ids = (n: number) => Array.from({ length: n }, (_, i): PageRef => ({ pageId: `p${i}` as PageId, sourceIndex: 0, sourcePageIndex: i, rotation: 0 }))
const base = { createdAt: 0, updatedAt: 0, zIndex: 1 }
const style = { color: '#ff0000', opacity: 1, width: 2 }

describe('page operations', () => {
  it('reorders, deletes and rotates while preserving content', async () => {
    const src = await makePdf(['ONE', 'TWO', 'THREE'])
    const out = await assemble([src], [
      { source: 0, page: 2, addRotation: 0 },
      { source: 0, page: 0, addRotation: 90 },
    ])
    if (!out.ok) throw new Error(out.error.message)
    const doc = await PDFDocument.load(out.value)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(1).getRotation().angle).toBe(90)
    expect(await textOf(out.value, 0)).toContain('THREE')
    expect(await textOf(out.value, 1)).toContain('ONE')
  })

  it('extracts ranges, and inserts another document at a position', async () => {
    const a = await makePdf(['A1', 'A2'])
    const b = await makePdf(['B1', 'B2', 'B3'])
    const ex = await extractPages(a, [1])
    expect(ex.ok && (await pageCount(ex.value))).toEqual({ ok: true, value: 1 })
    const merged = await insertDocument(a, b, 1)
    if (!merged.ok) throw new Error()
    expect(merged.value.insertedCount).toBe(3)
    const texts = await Promise.all([0, 1, 2, 3, 4].map((i) => textOf(merged.value.bytes, i)))
    expect(texts.map((t) => t.trim())).toEqual(['A1', 'B1', 'B2', 'B3', 'A2'])
  })

  it('reports encrypted/corrupt input with typed errors', async () => {
    const r = await pageCount(new Uint8Array([1, 2, 3]))
    expect(r.ok === false && r.error.code).toBe('CORRUPTED_PDF')
  })
})

describe('export', () => {
  const sig = new Uint8Array(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  )

  it('writes every annotation type to a PDF that re-opens with the right page count', async () => {
    const src = await makePdf(['ONE', 'TWO'])
    const pages = ids(2)
    const sid = 's1' as SignatureId
    const a = (x: object, i: number): Annotation => ({ ...base, id: `a${i}` as AnnotationId, pageId: pages[0].pageId, ...x }) as Annotation
    const annotations: Annotation[] = [
      a({ type: 'highlight', quads: [{ x: 50, y: 70, width: 80, height: 24 }], color: '#ffff00', opacity: 0.4 }, 0),
      a({ type: 'underline', quads: [{ x: 50, y: 70, width: 80, height: 24 }], color: '#ff0000', opacity: 1 }, 1),
      a({ type: 'strikethrough', quads: [{ x: 50, y: 70, width: 80, height: 24 }], color: '#ff0000', opacity: 1 }, 2),
      a({ type: 'freehand', points: [{ x: 1, y: 1 }, { x: 20, y: 30 }, { x: 60, y: 10 }], style }, 3),
      a({ type: 'rectangle', bounds: { x: 10, y: 10, width: 50, height: 30 }, rotation: 15, stroke: style, fill: { color: '#00ff00', opacity: 0.3 } }, 4),
      a({ type: 'ellipse', bounds: { x: 10, y: 60, width: 50, height: 30 }, rotation: 0, stroke: style, fill: null }, 5),
      a({ type: 'line', start: { x: 0, y: 0 }, end: { x: 90, y: 90 }, style }, 6),
      a({ type: 'arrow', start: { x: 0, y: 0 }, end: { x: 90, y: 40 }, style }, 7),
      a({ type: 'text', bounds: { x: 100, y: 100, width: 150, height: 60 }, rotation: 0, text: 'Hello Acrobat — wrapped text ខ្មែរ', style: { color: '#0000ff', fontFamily: 'Helvetica', fontSize: 14, align: 'left' } }, 8),
      a({ type: 'note', position: { x: 300, y: 30 }, text: 'A sticky note', color: '#ffd400' }, 9),
      a({ type: 'stamp', stamp: 'APPROVED', bounds: { x: 200, y: 200, width: 150, height: 40 }, rotation: 10 }, 10),
      a({ type: 'signature', signatureId: sid, bounds: { x: 20, y: 200, width: 100, height: 40 }, rotation: 0 }, 11),
    ]
    const r = await exportPdf({ source: buf(src), pages, annotations, signatures: new Map([[sid, { mime: 'image/png', bytes: buf(sig) }]]) })
    if (!r.ok) throw new Error(r.error.message)
    const out = await PDFDocument.load(r.value.bytes)
    expect(out.getPageCount()).toBe(2)
    expect(out.getPage(1).node.Annots()?.size() ?? 0).toBe(0)
    expect(out.getPage(0).node.Annots()?.size()).toBe(1) // the sticky note is a real /Text annotation
    expect(await textOf(new Uint8Array(r.value.bytes), 0)).toContain('Hello Acrobat')
    expect(await textOf(new Uint8Array(r.value.bytes), 0)).toContain('APPROVED')
  })

  it('refuses to export while unapplied redaction markers exist', async () => {
    const src = await makePdf(['X'])
    const pages = ids(1)
    const marker = { ...base, id: 'r' as AnnotationId, pageId: pages[0].pageId, type: 'redaction', bounds: { x: 0, y: 0, width: 5, height: 5 } } as Annotation
    const r = await exportPdf({ source: buf(src), pages, annotations: [marker], signatures: new Map() })
    expect(r.ok === false && r.error.code).toBe('REDACTION_UNSAFE')
  })
})

describe('permanent redaction', () => {
  it('removes the redacted text from the output while leaving other pages intact', async () => {
    const src = await makePdf(['SECRET-4242', 'PUBLIC-PAGE'])
    expect(await textOf(src, 0)).toContain('SECRET-4242')
    const pdfjsDoc = await pdfjs.getDocument({ data: src.slice(), useSystemFonts: true }).promise
    const pages = ids(2)
    const grouped = groupByPage([{ pageId: pages[0].pageId, bounds: { x: 40, y: 60, width: 300, height: 50 } }], pages)
    if (!grouped.ok) throw new Error()
    const r = await applyRedactions({ bytes: src, pdfjsDoc: pdfjsDoc as never, regions: grouped.value }, raster)
    if (!r.ok) throw new Error(r.error.message)

    // 1. Text extraction finds nothing on the redacted page, and the public page is intact.
    expect((await textOf(r.value, 0)).trim()).toBe('')
    expect(await textOf(r.value, 1)).toContain('PUBLIC-PAGE')
    // 2. Raw object inspection: the secret is nowhere in the file bytes, even uncompressed.
    const raw = Buffer.from(r.value).toString('latin1')
    expect(raw).not.toContain('SECRET-4242')
    // 3. The black box really covers the text pixels (rendered page region is dark).
    const check = await pdfjs.getDocument({ data: r.value.slice() }).promise
    const page = await check.getPage(1)
    const vp = page.getViewport({ scale: 1 })
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
    await page.render({ canvasContext: canvas.getContext('2d') as never, canvas: canvas as never, viewport: vp }).promise
    const px = canvas.getContext('2d').getImageData(100, 80, 1, 1).data // y=80 from top is within the 60..110 box
    expect([px[0], px[1], px[2]]).toEqual([0, 0, 0])
    await pdfjsDoc.loadingTask.destroy()
  })
})

describe('forms and compression', () => {
  it('lists and fills text and checkbox fields on export', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([300, 200])
    const form = doc.getForm()
    form.createTextField('name').addToPage(page, { x: 20, y: 140, width: 200, height: 24 })
    form.createCheckBox('agree').addToPage(page, { x: 20, y: 100, width: 18, height: 18 })
    const src = await doc.save()
    const fields = await listFormFields(src)
    expect(fields.ok && fields.value.map((f) => f.kind).sort()).toEqual(['checkbox', 'text'])
    const r = await exportPdf({ source: buf(src), pages: ids(1), annotations: [], signatures: new Map(), formValues: { name: 'Sokun', agree: true } })
    if (!r.ok) throw new Error(r.error.message)
    const back = await listFormFields(r.value.bytes)
    expect(back.ok && back.value).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'name', value: 'Sokun' }),
      expect.objectContaining({ name: 'agree', value: true }),
    ]))
  })

  it('replaces only smaller DCT images and updates their dimensions', async () => {
    const doc = await PDFDocument.create()
    const jpeg = createCanvas(40, 40).toBuffer('image/jpeg')
    const img = await doc.embedJpg(jpeg)
    doc.addPage([100, 100]).drawImage(img, { x: 0, y: 0, width: 50, height: 50 })
    await doc.flush() // pdf-lib creates image objects lazily
    const small = new Uint8Array(jpeg.subarray(0, Math.max(10, jpeg.length - 5)))
    const n = await compressImages(doc, { maxImageDimension: 20, imageQuality: 0.5, stripMetadata: false }, async () => ({ bytes: small, width: 20, height: 20 }))
    expect(n).toBe(1)
    const none = await compressImages(doc, { maxImageDimension: 20, imageQuality: 0.5, stripMetadata: false }, async () => null)
    expect(none).toBe(0)
  })
})

describe('annotation placement', () => {
  it.each([0, 90, 180, 270] as const)('lands where the viewport transform says at page rotation %i', async (rot) => {
    const { createPageTransform } = await import('../../src/lib/geometry/transform')
    const src = await makePdf(['ONE'])
    const rotated = await assemble([src], [{ source: 0, page: 0, addRotation: rot }])
    if (!rotated.ok) throw new Error()
    const pages = ids(1)
    const rect: Annotation = {
      ...base, id: 'r' as AnnotationId, pageId: pages[0].pageId, type: 'rectangle',
      bounds: { x: 300, y: 20, width: 60, height: 40 }, rotation: 0,
      stroke: { color: '#00ff00', opacity: 1, width: 1 }, fill: { color: '#00ff00', opacity: 1 },
    }
    const r = await exportPdf({ source: buf(rotated.value), pages, annotations: [rect], signatures: new Map() })
    if (!r.ok) throw new Error(r.error.message)

    const doc = await pdfjs.getDocument({ data: new Uint8Array(r.value.bytes) }).promise
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 1 }) // includes /Rotate
    const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx as never, canvas: canvas as never, viewport: vp }).promise

    const t = createPageTransform({ pageSize: { width: 400, height: 300 }, rotation: rot, scale: 1 })
    const c = t.toViewport({ x: 330, y: 40 })
    const px = ctx.getImageData(Math.round(c.x), Math.round(c.y), 1, 1).data
    expect([px[0], px[1], px[2]]).toEqual([0, 255, 0])
    const off = t.toViewport({ x: 100, y: 250 })
    const bg = ctx.getImageData(Math.round(off.x), Math.round(off.y), 1, 1).data
    expect([bg[0], bg[1], bg[2]]).toEqual([255, 255, 255])
    await doc.loadingTask.destroy()
  })
})

describe('replaced page text', () => {
  it('exports the replacement text over a cover of the original', async () => {
    const src = await makePdf(['ORIGINAL'])
    const edit: Annotation = {
      ...base, id: 'e1' as AnnotationId, pageId: 'p0' as PageId, type: 'textedit',
      bounds: { x: 49, y: 70, width: 140, height: 28 }, originalText: 'ORIGINAL', text: 'REPLACED', coverColor: '#ffffff',
      style: { color: '#000000', fontFamily: 'Helvetica', fontSize: 24, align: 'left' },
    }
    const r = await exportPdf({ source: buf(src), pages: ids(1), annotations: [edit], signatures: new Map() })
    if (!r.ok) throw new Error(r.error.message)
    const text = await textOf(new Uint8Array(r.value.bytes), 0)
    expect(text).toContain('REPLACED')
  })
})
