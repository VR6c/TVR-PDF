import { callWorker } from './pdf/workerClient'
import { freshPages } from './session'
import { useDocument } from '../stores/document'
import { err, ok } from '../types'
import type { Annotation, PagePoint, PageRect, PageRef, Result, Rotation } from '../types'

const guard = (): Result<{ bytes: ArrayBuffer; pages: PageRef[] }> => {
  const s = useDocument.getState()
  if (!s.baseBytes) return err({ code: 'INTERNAL', message: 'No document is open.' })
  if (s.encrypted) return err({ code: 'UNSUPPORTED_ENCRYPTION', message: 'Editing pages of an encrypted PDF is not supported.' })
  return ok({ bytes: s.baseBytes, pages: s.pages })
}

const toBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

/** Rebuilds the working PDF from `plan`, keeping PageIds (and so annotations) for every surviving page. One undo step. */
async function applyPlan(plan: { index: number; addRotation: Rotation }[]): Promise<Result<void>> {
  const g = guard()
  if (!g.ok) return g
  const r = await callWorker<Uint8Array>('assemble', { sources: [g.value.bytes], plan: plan.map((p) => ({ source: 0, page: p.index, addRotation: p.addRotation })) })
  if (!r.ok) return r
  const pages = plan.map((p, i): PageRef => ({ ...g.value.pages[p.index], sourcePageIndex: i, rotation: 0 }))
  const keep = new Set(pages.map((p) => p.pageId))
  const annotations = useDocument.getState().annotations.filter((a) => keep.has(a.pageId))
  useDocument.getState().replaceBase(toBuffer(r.value), pages, annotations)
  return ok(undefined)
}

const all = () => useDocument.getState().pages.map((_, index) => ({ index, addRotation: 0 as Rotation }))

export function rotatePages(indexes: number[], by: 90 | 270) {
  const set = new Set(indexes)
  return applyPlan(all().map((p) => (set.has(p.index) ? { ...p, addRotation: by as Rotation } : p)))
}

export function deletePages(indexes: number[]) {
  const set = new Set(indexes)
  const plan = all().filter((p) => !set.has(p.index))
  if (!plan.length) return Promise.resolve(err({ code: 'INVALID_PAGE_RANGE' as const, message: 'A document needs at least one page.' }))
  return applyPlan(plan)
}

/** Moves `indexes` (kept in their relative order) so they sit before original page `before` (use pageCount for the end). */
export function movePages(indexes: number[], before: number) {
  const set = new Set(indexes)
  const moving = all().filter((p) => set.has(p.index))
  const rest = all().filter((p) => !set.has(p.index))
  const at = rest.filter((p) => p.index < before).length
  rest.splice(at, 0, ...moving)
  return applyPlan(rest)
}

export async function insertPdf(other: ArrayBuffer, at: number): Promise<Result<number>> {
  const g = guard()
  if (!g.ok) return g
  const r = await callWorker<{ bytes: Uint8Array; insertedCount: number }>('insert', { bytes: g.value.bytes, other, at })
  if (!r.ok) return r
  const pages = [...g.value.pages]
  pages.splice(at, 0, ...freshPages(r.value.insertedCount))
  useDocument.getState().replaceBase(toBuffer(r.value.bytes), pages.map((p, i) => ({ ...p, sourcePageIndex: i })))
  return ok(r.value.insertedCount)
}

/** Adds a blank page before page index `at` (use the page count to append). One undo step. */
export async function insertBlank(at: number): Promise<Result<void>> {
  const g = guard()
  if (!g.ok) return g
  const r = await callWorker<Uint8Array>('blank', { bytes: g.value.bytes, at })
  if (!r.ok) return r
  const pages = [...g.value.pages]
  pages.splice(at, 0, ...freshPages(1))
  useDocument.getState().replaceBase(toBuffer(r.value), pages.map((p, i) => ({ ...p, sourcePageIndex: i })))
  return ok(undefined)
}

/** Changes paper size of pages (content is not scaled; top-left stays fixed). One undo step. */
export async function resizeSelected(indexes: number[], width: number, height: number): Promise<Result<void>> {
  const g = guard()
  if (!g.ok) return g
  const r = await callWorker<Uint8Array>('resize', { bytes: g.value.bytes, indexes, width, height })
  if (!r.ok) return r
  useDocument.getState().replaceBase(toBuffer(r.value), g.value.pages)
  return ok(undefined)
}

/** Turns PNG/JPEG images into pages (one each) and inserts them before page index `at`. */
export async function insertImages(images: { mime: 'image/png' | 'image/jpeg'; bytes: ArrayBuffer }[], at: number): Promise<Result<number>> {
  const made = await callWorker<Uint8Array>('images', { images })
  if (!made.ok) return made
  return insertPdf(toBuffer(made.value), at)
}

/** Moves every coordinate of an annotation by (dx, dy) in page space. */
export function shiftAnnotation(a: Annotation, dx: number, dy: number): Annotation {
  const pt = (p: PagePoint): PagePoint => ({ x: p.x + dx, y: p.y + dy })
  const rect = (r: PageRect): PageRect => ({ ...r, x: r.x + dx, y: r.y + dy })
  switch (a.type) {
    case 'highlight': case 'underline': case 'strikethrough': return { ...a, quads: a.quads.map(rect) }
    case 'freehand': return { ...a, points: a.points.map(pt) }
    case 'line': case 'arrow': return { ...a, start: pt(a.start), end: pt(a.end) }
    case 'note': return { ...a, position: pt(a.position) }
    default: return { ...a, bounds: rect(a.bounds) }
  }
}

/** Crops pages (margins in PDF points, as seen on screen) and keeps annotations where they were on the page. One undo step. */
export async function cropSelected(indexes: number[], margins: { top: number; right: number; bottom: number; left: number }): Promise<Result<void>> {
  const g = guard()
  if (!g.ok) return g
  const r = await callWorker<{ bytes: Uint8Array; applied: { index: number; dx: number; dy: number }[] }>('crop', { bytes: g.value.bytes, indexes, margins })
  if (!r.ok) return r
  const shift = new Map(r.value.applied.map((c) => [g.value.pages[c.index].pageId, c]))
  const annotations = useDocument.getState().annotations.map((a) => {
    const c = shift.get(a.pageId)
    return c ? shiftAnnotation(a, c.dx, c.dy) : a
  })
  useDocument.getState().replaceBase(toBuffer(r.value.bytes), g.value.pages, annotations)
  return ok(undefined)
}

export async function extractBytes(indexes: number[]): Promise<Result<Uint8Array>> {
  const g = guard()
  if (!g.ok) return g
  return callWorker<Uint8Array>('extract', { bytes: g.value.bytes, indexes })
}

export async function splitBytes(groups: number[][]): Promise<Result<Uint8Array[]>> {
  const g = guard()
  if (!g.ok) return g
  return callWorker<Uint8Array[]>('split', { bytes: g.value.bytes, groups })
}
