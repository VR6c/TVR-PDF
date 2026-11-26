import { PDFDocument, degrees } from 'pdf-lib'
import { err, ok } from '../../types'
import type { Result, Rotation } from '../../types'

export interface PagePlan {
  /** Which source (index into `sources`) and which 0-based page in it. */
  source: number
  page: number
  /** Extra clockwise rotation added to the page's existing /Rotate. */
  addRotation: Rotation
}

export async function loadPdfLib(bytes: ArrayBuffer | Uint8Array): Promise<Result<PDFDocument>> {
  try {
    return ok(await PDFDocument.load(bytes))
  } catch (e) {
    const name = e instanceof Error ? e.constructor.name : ''
    if (name === 'EncryptedPDFError') {
      return err({ code: 'UNSUPPORTED_ENCRYPTION', message: 'Editing or exporting encrypted PDFs is not supported.' })
    }
    return err({ code: 'CORRUPTED_PDF', message: 'The PDF could not be processed.' })
  }
}

/** Assembles a new PDF from pages of one or more sources, applying rotation. */
export async function assemble(sources: (ArrayBuffer | Uint8Array)[], plan: readonly PagePlan[]): Promise<Result<Uint8Array>> {
  const loaded: PDFDocument[] = []
  for (const bytes of sources) {
    const r = await loadPdfLib(bytes)
    if (!r.ok) return r
    loaded.push(r.value)
  }
  const out = await PDFDocument.create()
  for (const step of plan) {
    const src = loaded[step.source]
    if (!src || step.page < 0 || step.page >= src.getPageCount()) {
      return err({ code: 'INTERNAL', message: 'Page plan refers to a page that does not exist.' })
    }
    const [copied] = await out.copyPages(src, [step.page])
    const angle = (src.getPage(step.page).getRotation().angle + step.addRotation) % 360
    copied.setRotation(degrees(angle))
    out.addPage(copied)
  }
  return ok(await out.save({ useObjectStreams: true }))
}

const identity = (count: number, source: number): PagePlan[] =>
  Array.from({ length: count }, (_, page) => ({ source, page, addRotation: 0 }))

export async function pageCount(bytes: ArrayBuffer | Uint8Array): Promise<Result<number>> {
  const r = await loadPdfLib(bytes)
  return r.ok ? ok(r.value.getPageCount()) : r
}

/** Pages of `bytes` by index (0-based) — used for split and extract. */
export async function extractPages(bytes: ArrayBuffer | Uint8Array, indexes: readonly number[]) {
  return assemble([bytes], indexes.map((page) => ({ source: 0, page, addRotation: 0 as Rotation })))
}

/** Inserts every page of `other` into `bytes` before `atIndex` (use page count to append). */
export async function insertDocument(bytes: ArrayBuffer | Uint8Array, other: ArrayBuffer | Uint8Array, atIndex: number) {
  const a = await pageCount(bytes)
  const b = await pageCount(other)
  if (!a.ok) return a
  if (!b.ok) return b
  const at = Math.min(Math.max(atIndex, 0), a.value)
  const plan = [...identity(a.value, 0)]
  plan.splice(at, 0, ...identity(b.value, 1))
  const out = await assemble([bytes, other], plan)
  return out.ok ? ok({ bytes: out.value, insertedCount: b.value }) : out
}

/** Concatenates whole PDFs in the order given. */
export async function mergeDocuments(sources: readonly (ArrayBuffer | Uint8Array)[]): Promise<Result<Uint8Array>> {
  const plan: PagePlan[] = []
  for (const [source, bytes] of sources.entries()) {
    const n = await pageCount(bytes)
    if (!n.ok) return n
    plan.push(...identity(n.value, source))
  }
  return assemble([...sources], plan)
}

/** Splits into separate PDFs for each group of page indexes. */
export async function splitPdf(bytes: ArrayBuffer | Uint8Array, groups: readonly (readonly number[])[]): Promise<Result<Uint8Array[]>> {
  const parts: Uint8Array[] = []
  for (const g of groups) {
    const r = await extractPages(bytes, g)
    if (!r.ok) return r
    parts.push(r.value)
  }
  return ok(parts)
}

/** Inserts an empty page before `atIndex`, sized like its neighbour (the page before it, or the first page at the start). */
export async function insertBlankPage(bytes: ArrayBuffer | Uint8Array, atIndex: number): Promise<Result<Uint8Array>> {
  const loaded = await loadPdfLib(bytes)
  if (!loaded.ok) return loaded
  const doc = loaded.value
  const at = Math.min(Math.max(atIndex, 0), doc.getPageCount())
  const ref = doc.getPage(Math.max(0, Math.min(at - 1, doc.getPageCount() - 1)))
  const { width, height } = ref.getSize()
  const rotated = ref.getRotation().angle % 180 !== 0
  doc.insertPage(at, rotated ? [height, width] : [width, height])
  return ok(await doc.save({ useObjectStreams: true }))
}

export interface Margins { top: number; right: number; bottom: number; left: number }
export interface CropApplied {
  index: number
  /** Shift to apply to annotation coordinates on this page (page space: top-left origin, unrotated, PDF points). */
  dx: number
  dy: number
}

const MIN_CROPPED = 36

/**
 * Crops pages by shrinking their CropBox. `visible` margins are as the reader sees the page
 * (top is the top of the screen), so they are mapped back through the page's /Rotate.
 */
export async function cropPages(bytes: ArrayBuffer | Uint8Array, indexes: readonly number[], visible: Margins): Promise<Result<{ bytes: Uint8Array; applied: CropApplied[] }>> {
  const loaded = await loadPdfLib(bytes)
  if (!loaded.ok) return loaded
  const doc = loaded.value
  const applied: CropApplied[] = []
  for (const index of indexes) {
    const page = doc.getPages()[index]
    if (!page) return err({ code: 'INTERNAL', message: 'Page plan refers to a page that does not exist.' })
    const { top, right, bottom, left } = visible
    // Visible edge → edge of the unrotated page.
    const m: Margins = ({
      0: { top, right, bottom, left },
      90: { top: right, right: bottom, bottom: left, left: top },
      180: { top: bottom, right: left, bottom: top, left: right },
      270: { top: left, right: top, bottom: right, left: bottom },
    } as Record<number, Margins>)[((page.getRotation().angle % 360) + 360) % 360] ?? { top, right, bottom, left }
    const box = page.getCropBox()
    const width = box.width - m.left - m.right
    const height = box.height - m.top - m.bottom
    if (width < MIN_CROPPED || height < MIN_CROPPED) {
      return err({ code: 'INVALID_PAGE_RANGE', message: `Page ${index + 1} would be too small after cropping. Use smaller margins.` })
    }
    page.setCropBox(box.x + m.left, box.y + m.bottom, width, height)
    applied.push({ index, dx: -m.left, dy: -m.top })
  }
  return ok({ bytes: await doc.save({ useObjectStreams: true }), applied })
}

export const PAPER_SIZES = { A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008] } as const

/**
 * Changes the paper size of pages without scaling their content: the top-left corner stays put,
 * so annotations keep their coordinates. Larger = blank space is added right/below; smaller = content is cut off.
 * `width`/`height` are as the reader sees the page; they are swapped for pages rotated 90°/270°.
 */
export async function resizePages(bytes: ArrayBuffer | Uint8Array, indexes: readonly number[], width: number, height: number): Promise<Result<Uint8Array>> {
  if (!(width >= 72 && height >= 72 && width <= 14400 && height <= 14400)) {
    return err({ code: 'INVALID_PAGE_RANGE', message: 'Page size must be between 1 and 200 inches on each side.' })
  }
  const loaded = await loadPdfLib(bytes)
  if (!loaded.ok) return loaded
  const doc = loaded.value
  for (const index of indexes) {
    const page = doc.getPages()[index]
    if (!page) return err({ code: 'INTERNAL', message: 'Page plan refers to a page that does not exist.' })
    const swap = page.getRotation().angle % 180 !== 0
    const [w, h] = swap ? [height, width] : [width, height]
    const box = page.getCropBox()
    const y = box.y + box.height - h
    page.setCropBox(box.x, y, w, h)
    page.setMediaBox(box.x, y, w, h)
  }
  return ok(await doc.save({ useObjectStreams: true }))
}

/** One page per image, sized like the image (96 dpi) but capped to fit A4 without enlarging. */
export async function imagesToPdf(images: readonly { mime: 'image/png' | 'image/jpeg'; bytes: ArrayBuffer | Uint8Array }[]): Promise<Result<Uint8Array>> {
  if (!images.length) return err({ code: 'INTERNAL', message: 'No images were provided.' })
  try {
    const doc = await PDFDocument.create()
    for (const im of images) {
      const img = im.mime === 'image/png' ? await doc.embedPng(im.bytes) : await doc.embedJpg(im.bytes)
      const k = Math.min(0.75, 595.28 / img.width, 841.89 / img.height)
      const page = doc.addPage([img.width * k, img.height * k])
      page.drawImage(img, { x: 0, y: 0, width: img.width * k, height: img.height * k })
    }
    return ok(await doc.save({ useObjectStreams: true }))
  } catch {
    return err({ code: 'INTERNAL', message: 'An image could not be added (is it a valid PNG or JPEG?).' })
  }
}
