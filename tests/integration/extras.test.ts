// @vitest-environment node
import { PDFDict, PDFDocument, degrees, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { createCanvas } from '@napi-rs/canvas'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { exportPdf } from '../../src/lib/pdf/export'
import { cropPages, imagesToPdf, insertBlankPage, PAPER_SIZES, resizePages } from '../../src/lib/pdf/pageOps'
import { importAnnotations } from '../../src/lib/annotations/io'
import { shiftAnnotation } from '../../src/lib/pageActions'
import type { TextRasterizer } from '../../src/lib/pdf/rasterText'
import type { Annotation, AnnotationId, PageId, PageRef } from '../../src/types'

const require = createRequire(import.meta.url)
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href

async function makePdf(n: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < n; i++) doc.addPage([400, 300]).drawText(`Body ${i + 1}`, { x: 50, y: 150, size: 20, font })
  const u = await doc.save()
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}
const pages = (n: number): PageRef[] => Array.from({ length: n }, (_, i) => ({ pageId: `p${i}` as PageId, sourceIndex: 0, sourcePageIndex: i, rotation: 0 }))
async function textOf(bytes: ArrayBuffer, i: number) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), useSystemFonts: true }).promise
  const content = await (await doc.getPage(i + 1)).getTextContent()
  const out = content.items.map((it) => ('str' in it ? it.str : '')).join(' ')
  await doc.loadingTask.destroy()
  return out
}
const run = async (n: number, extra: Record<string, unknown>, opts = {}) => {
  const r = await exportPdf({ source: await makePdf(n), pages: pages(n), annotations: [], signatures: new Map(), ...extra } as never, opts)
  if (!r.ok) throw new Error(r.error.message)
  return r.value.bytes
}

describe('page extras', () => {
  it('stamps header, footer and page numbers with {n}/{total}', async () => {
    const out = await run(3, { decorations: { header: 'Report', footer: 'Acme', pageNumbers: { format: 'Page {n} of {total}', position: 'right' } } })
    const t = await textOf(out, 1)
    expect(t).toContain('Report')
    expect(t).toContain('Acme')
    expect(t).toContain('Page 2 of 3')
    expect(await textOf(out, 2)).toContain('Page 3 of 3')
  })

  it('adds a watermark to every page', async () => {
    const out = await run(2, { decorations: { watermark: { text: 'DRAFT', opacity: 0.2 } } })
    expect(await textOf(out, 0)).toContain('DRAFT')
    expect(await textOf(out, 1)).toContain('DRAFT')
  })

  it('writes edited metadata', async () => {
    const out = await run(1, { metadata: { title: 'My Title', author: 'Ann', keywords: 'a, b' } })
    const doc = await PDFDocument.load(out)
    expect(doc.getTitle()).toBe('My Title')
    expect(doc.getAuthor()).toBe('Ann')
    expect(doc.getKeywords()).toBe('a b')
  })

  it('writes user bookmarks into the outline, following page order', async () => {
    const out = await run(3, { bookmarks: [{ id: '1', pageId: 'p2', title: 'Third' }, { id: '2', pageId: 'p0', title: 'First' }, { id: '3', pageId: 'gone', title: 'Deleted' }] })
    const doc = await pdfjs.getDocument({ data: new Uint8Array(out.slice(0)) }).promise
    const outline = (await doc.getOutline()) as { title: string; dest: unknown[] }[]
    expect(outline.map((o) => o.title)).toEqual(['Third', 'First'])
    expect(await doc.getPageIndex(outline[0].dest[0] as never)).toBe(2)
    await doc.loadingTask.destroy()
  })

  it('draws highlights with a multiply blend', async () => {
    const hl: Annotation = { id: 'a' as AnnotationId, pageId: 'p0' as PageId, type: 'highlight', color: '#ffff00', opacity: 0.5, quads: [{ x: 10, y: 10, width: 50, height: 12 }], zIndex: 1, createdAt: 0, updatedAt: 0 } as never
    const out = await run(1, { annotations: [hl] })
    const doc = await PDFDocument.load(out)
    const states = doc.getPage(0).node.Resources()?.lookup(PDFName.of('ExtGState'), PDFDict)
    const blends = (states?.keys() ?? []).filter((k) => states!.lookup(k, PDFDict).get(PDFName.of('BM'))?.toString() === '/Multiply')
    expect(blends.length).toBeGreaterThan(0)
  })
})

describe('non-Latin text (Khmer)', () => {
  const fake: TextRasterizer = {
    measure: (t, size) => t.length * size * 0.5,
    render: async (t, size) => {
      const c = createCanvas(Math.max(1, t.length * 6), 20)
      return { bytes: new Uint8Array(c.toBuffer('image/png')), width: t.length * size * 0.5, height: size * 1.5 }
    },
  }
  const text = (t: string): Annotation => ({
    id: 'k' as AnnotationId, pageId: 'p0' as PageId, type: 'text', text: t, bounds: { x: 20, y: 20, width: 200, height: 40 }, rotation: 0,
    style: { color: '#000000', fontFamily: 'Helvetica', fontSize: 14, align: 'left' }, zIndex: 1, createdAt: 0, updatedAt: 0,
  } as never)

  it('renders unsupported characters as images instead of "?"', async () => {
    const out = await run(1, { annotations: [text('សួស្តី')] }, { rasterizer: fake })
    const doc = await PDFDocument.load(out)
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
    expect(images.length).toBeGreaterThan(0)
  })

  it('keeps Latin text as real text', async () => {
    const out = await run(1, { annotations: [text('Hello')] }, { rasterizer: fake })
    expect(await textOf(out, 0)).toContain('Hello')
  })
})

describe('blank page', () => {
  it('inserts an empty page at the requested position, sized like its neighbour', async () => {
    const r = await insertBlankPage(await makePdf(2), 1)
    if (!r.ok) throw new Error(r.error.message)
    const doc = await PDFDocument.load(r.value)
    expect(doc.getPageCount()).toBe(3)
    expect(doc.getPage(1).getSize()).toEqual({ width: 400, height: 300 })
    const b = r.value.buffer.slice(r.value.byteOffset, r.value.byteOffset + r.value.byteLength) as ArrayBuffer
    expect(await textOf(b, 1)).toBe('')
    expect(await textOf(b, 2)).toContain('Body 2')
  })
})

describe('image annotation', () => {
  const png = createCanvas(4, 2).toBuffer('image/png').toString('base64')
  const dataUrl = `data:image/png;base64,${png}`
  const img = (url = dataUrl): Annotation => ({
    id: 'i' as AnnotationId, pageId: 'p0' as PageId, type: 'image', mime: 'image/png', dataUrl: url,
    bounds: { x: 10, y: 10, width: 80, height: 40 }, rotation: 0, zIndex: 1, createdAt: 0, updatedAt: 0,
  })

  it('embeds the picture in the exported PDF', async () => {
    const out = await run(1, { annotations: [img()] })
    const doc = await PDFDocument.load(out)
    const images = doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image')
    expect(images.length).toBeGreaterThan(0) // PNG with alpha = image + soft mask
  })

  it('shares one embedded image between copies of the same picture', async () => {
    const count = async (annotations: Annotation[]) => {
      const doc = await PDFDocument.load(await run(1, { annotations }))
      return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length
    }
    expect(await count([img(), { ...img(), id: 'j' as AnnotationId }])).toBe(await count([img()]))
  })

  it('round-trips through JSON import and rejects a mismatched data URL', () => {
    const file = (a: unknown) => ({ schemaVersion: 1, annotations: [{ ...(a as object), pageIndex: 0 }] })
    expect(importAnnotations(file(img()), pages(1)).ok).toBe(true)
    expect(importAnnotations(file({ ...img(), dataUrl: 'data:text/html;base64,AAAA' }), pages(1)).ok).toBe(false)
  })
})

describe('crop', () => {
  it('shrinks the crop box and reports the annotation shift', async () => {
    const r = await cropPages(await makePdf(2), [1], { top: 20, right: 10, bottom: 30, left: 40 })
    if (!r.ok) throw new Error(r.error.message)
    const doc = await PDFDocument.load(r.value.bytes)
    expect(doc.getPage(0).getCropBox().width).toBe(400)
    expect(doc.getPage(1).getCropBox()).toEqual({ x: 40, y: 30, width: 350, height: 250 })
    expect(r.value.applied).toEqual([{ index: 1, dx: -40, dy: -20 }])
  })

  it('maps on-screen margins through the page rotation', async () => {
    const src = await PDFDocument.create()
    src.addPage([400, 300]).setRotation(degrees(90))
    const u = await src.save()
    const r = await cropPages(u, [0], { top: 20, right: 0, bottom: 0, left: 0 })
    if (!r.ok) throw new Error(r.error.message)
    // Rotated 90° clockwise: the screen's top is the unrotated page's left edge.
    expect((await PDFDocument.load(r.value.bytes)).getPage(0).getCropBox()).toEqual({ x: 20, y: 0, width: 380, height: 300 })
    expect(r.value.applied[0]).toEqual({ index: 0, dx: -20, dy: -0 })
  })

  it('refuses a crop that leaves almost nothing', async () => {
    const r = await cropPages(await makePdf(1), [0], { top: 0, right: 0, bottom: 0, left: 380 })
    expect(r.ok).toBe(false)
  })

  it('moves every kind of annotation geometry', () => {
    const base = { id: 'a' as AnnotationId, pageId: 'p0' as PageId, zIndex: 1, createdAt: 0, updatedAt: 0 }
    const line = shiftAnnotation({ ...base, type: 'line', start: { x: 10, y: 10 }, end: { x: 20, y: 30 }, style: { color: '#000000', opacity: 1, width: 1 } }, -5, -2)
    expect(line).toMatchObject({ start: { x: 5, y: 8 }, end: { x: 15, y: 28 } })
    const hl = shiftAnnotation({ ...base, type: 'highlight', color: '#ffff00', opacity: 0.4, quads: [{ x: 10, y: 10, width: 5, height: 5 }] }, -5, -2)
    expect(hl).toMatchObject({ quads: [{ x: 5, y: 8, width: 5, height: 5 }] })
    const note = shiftAnnotation({ ...base, type: 'note', position: { x: 10, y: 10 }, text: '', color: '#facc15' }, -5, -2)
    expect(note).toMatchObject({ position: { x: 5, y: 8 } })
  })
})

describe('links and form fields', () => {
  const base = { id: 'l' as AnnotationId, pageId: 'p0' as PageId, zIndex: 1, createdAt: 0, updatedAt: 0 }
  const link = (over: object): Annotation => ({ ...base, type: 'link', bounds: { x: 10, y: 10, width: 100, height: 20 }, url: '', targetPageId: null, ...over }) as never
  const field = (over: object): Annotation => ({ ...base, type: 'field', fieldType: 'text', name: 'name', bounds: { x: 10, y: 50, width: 100, height: 20 }, options: [], ...over }) as never

  it('writes a URI link and a page link that pdf.js can read', async () => {
    const out = await run(3, { annotations: [link({ url: 'https://example.com' }), link({ id: 'm' as AnnotationId, targetPageId: 'p2', bounds: { x: 10, y: 100, width: 50, height: 20 } })] })
    const doc = await pdfjs.getDocument({ data: new Uint8Array(out.slice(0)) }).promise
    const links = (await (await doc.getPage(1)).getAnnotations()).filter((a: { subtype: string }) => a.subtype === 'Link') as { url?: string; dest?: unknown[] }[]
    expect(links.map((l) => l.url).filter(Boolean)).toEqual(['https://example.com/'])
    expect(links.some((l) => Array.isArray(l.dest))).toBe(true)
    await doc.loadingTask.destroy()
  })

  it('never writes javascript: links', async () => {
    const out = await run(1, { annotations: [link({ url: 'javascript:alert(1)' })] })
    const doc = await PDFDocument.load(out)
    expect(doc.getPage(0).node.Annots()?.size() ?? 0).toBe(0)
    expect(importAnnotations({ schemaVersion: 1, annotations: [{ ...link({ url: 'javascript:alert(1)' }), pageIndex: 0 }] }, pages(1)).ok).toBe(false)
  })

  it('creates text, checkbox and dropdown fields with unique names', async () => {
    const out = await run(1, { annotations: [
      field({}), field({ id: 'b' as AnnotationId }),
      field({ id: 'c' as AnnotationId, fieldType: 'checkbox', name: 'agree' }),
      field({ id: 'd' as AnnotationId, fieldType: 'dropdown', name: 'pick', options: ['A', '', 'B'] }),
    ] })
    const form = (await PDFDocument.load(out)).getForm()
    expect(form.getFields().map((f) => f.getName()).sort()).toEqual(['agree', 'name', 'name_2', 'pick'])
    expect(form.getDropdown('pick').getOptions()).toEqual(['A', 'B'])
  })
})

describe('resize and images to pages', () => {
  it('changes paper size keeping the top-left fixed (so annotations do not move)', async () => {
    const r = await resizePages(await makePdf(2), [0], ...PAPER_SIZES.A4)
    if (!r.ok) throw new Error(r.error.message)
    const doc = await PDFDocument.load(r.value)
    const box = doc.getPage(0).getCropBox()
    expect(box.width).toBeCloseTo(595.28)
    expect(box.height).toBeCloseTo(841.89)
    expect(box.y + box.height).toBeCloseTo(300) // top edge unchanged
    expect(doc.getPage(1).getSize()).toEqual({ width: 400, height: 300 })
  })

  it('swaps width and height on a page rotated 90°', async () => {
    const src = await PDFDocument.create()
    src.addPage([400, 300]).setRotation(degrees(90))
    const r = await resizePages(await src.save(), [0], 600, 800)
    if (!r.ok) throw new Error(r.error.message)
    expect((await PDFDocument.load(r.value)).getPage(0).getSize()).toEqual({ width: 800, height: 600 })
  })

  it('rejects absurd sizes', async () => {
    expect((await resizePages(await makePdf(1), [0], 5, 5)).ok).toBe(false)
  })

  it('makes one page per image, capped to A4', async () => {
    const png = (w: number, h: number) => new Uint8Array(createCanvas(w, h).toBuffer('image/png'))
    const r = await imagesToPdf([{ mime: 'image/png', bytes: png(100, 50) }, { mime: 'image/png', bytes: png(3000, 4000) }])
    if (!r.ok) throw new Error(r.error.message)
    const doc = await PDFDocument.load(r.value)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(0).getSize()).toEqual({ width: 75, height: 37.5 })
    expect(doc.getPage(1).getSize().height).toBeLessThanOrEqual(841.9)
    expect((await imagesToPdf([{ mime: 'image/png', bytes: new Uint8Array([1, 2, 3]) }])).ok).toBe(false)
  })
})
