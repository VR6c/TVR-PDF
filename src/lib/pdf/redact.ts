import { PDFDocument, degrees } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { createPageTransform } from '../geometry/transform'
import { err, ok } from '../../types'
import type { PageRect, PageId, PageRef, Result } from '../../types'
import { loadPdfLib } from './pageOps'

/** Platform hooks so the same code runs in the browser and in Node tests. */
export interface RasterBackend {
  createCanvas(width: number, height: number): CanvasLike
  /** JPEG/PNG bytes of the canvas. */
  encode(canvas: CanvasLike): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' }>
}

/** The subset of Canvas used here; satisfied by HTMLCanvasElement, OffscreenCanvas and @napi-rs/canvas. */
export interface CanvasLike {
  width: number
  height: number
  getContext(type: '2d'): any
}

export const browserRaster: RasterBackend = {
  createCanvas: (w, h) => new OffscreenCanvas(w, h) as unknown as CanvasLike,
  encode: async (c) => {
    const blob = await (c as unknown as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.92 })
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' }
  },
}

export interface RedactionRequest {
  bytes: ArrayBuffer | Uint8Array
  pdfjsDoc: PDFDocumentProxy
  /** Regions by page, in page space. */
  regions: ReadonlyMap<number, readonly PageRect[]>
  /** Pixels per PDF point for the rasterized pages. 2.5 ≈ 180 dpi. */
  scale?: number
}

/**
 * Permanent redaction by rasterization: every page that has a region is rendered
 * to an image, the regions are painted black in the pixels, and the page's
 * original content (text, vectors, images) is replaced by that image. Nothing
 * under the black boxes survives in the file, but the whole page becomes
 * non-selectable image content — a deliberate, documented trade-off. The output is
 * a new document built from copied (untouched) pages plus the image pages, so the old
 * page objects are not carried along. Document-level outline/forms/metadata are not
 * carried over either. Never overlays a box on live content.
 */
export async function applyRedactions(req: RedactionRequest, raster: RasterBackend): Promise<Result<Uint8Array>> {
  const loaded = await loadPdfLib(req.bytes)
  if (!loaded.ok) return loaded
  const src = loaded.value
  const scale = req.scale ?? 2.5

  // Build a NEW document and copy only untouched pages. pdf-lib never garbage-collects,
  // so editing in place and deleting the old page would leave the original text in the file.
  const out = await PDFDocument.create()
  for (let index = 0; index < src.getPageCount(); index++) {
    const rects = req.regions.get(index)
    if (!rects?.length) {
      const [copied] = await out.copyPages(src, [index])
      out.addPage(copied)
      continue
    }
    const page = await req.pdfjsDoc.getPage(index + 1)
    // rotation: 0 → render the page in its unrotated orientation so page space is preserved exactly.
    const viewport = page.getViewport({ scale, rotation: 0 })
    const canvas = raster.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise

    const t = createPageTransform({ pageSize: { width: viewport.width / scale, height: viewport.height / scale }, rotation: 0, scale })
    ctx.fillStyle = '#000000'
    for (const r of rects) {
      const v = t.rectToViewport(r)
      ctx.fillRect(Math.floor(v.x), Math.floor(v.y), Math.ceil(v.width) + 1, Math.ceil(v.height) + 1)
    }
    page.cleanup()

    const { bytes, mime } = await raster.encode(canvas)
    const img = mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes)
    const box = src.getPage(index).getCropBox()
    const fresh = out.addPage([box.width, box.height])
    fresh.drawImage(img, { x: 0, y: 0, width: box.width, height: box.height })
    fresh.setRotation(degrees(src.getPage(index).getRotation().angle))
  }
  return ok(await out.save({ useObjectStreams: false }))
}

export interface RedactionMarker {
  pageId: PageId
  bounds: PageRect
}

/** Groups markers by current page index. */
export function groupByPage(markers: readonly RedactionMarker[], pages: readonly PageRef[]): Result<Map<number, PageRect[]>> {
  const index = new Map(pages.map((p, i) => [p.pageId, i]))
  const out = new Map<number, PageRect[]>()
  for (const m of markers) {
    const i = index.get(m.pageId)
    if (i === undefined) return err({ code: 'REDACTION_UNSAFE', message: 'A redaction mark refers to a page that no longer exists.' })
    out.set(i, [...(out.get(i) ?? []), m.bounds])
  }
  return ok(out)
}

