import { ANNOTATION_SCHEMA_VERSION, err, newId, ok } from '../../types'
import type { Annotation, AnnotationExportFile, AnnotationId, PageRef, Result } from '../../types'

export function exportAnnotations(annotations: readonly Annotation[], pages: readonly PageRef[]): AnnotationExportFile {
  const index = new Map(pages.map((p, i) => [p.pageId, i]))
  return {
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pageCount: pages.length,
    annotations: annotations
      .filter((a) => index.has(a.pageId))
      .map(({ pageId, ...rest }) => ({ ...rest, pageIndex: index.get(pageId)! })) as AnnotationExportFile['annotations'],
  }
}

const bad = (message: string) => err({ code: 'INVALID_ANNOTATION_DATA' as const, message })

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, max = 20000): v is string => typeof v === 'string' && v.length <= max
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)
const unit = (v: unknown): v is number => num(v) && v >= 0 && v <= 1
const point = (v: unknown): boolean => isObj(v) && num(v.x) && num(v.y)
const rect = (v: unknown): boolean => isObj(v) && num(v.x) && num(v.y) && num(v.width) && num(v.height) && (v.width as number) >= 0 && (v.height as number) >= 0
const stroke = (v: unknown): boolean => isObj(v) && color(v.color) && unit(v.opacity) && num(v.width) && v.width >= 0 && v.width <= 200
/** Links may only open web or mail addresses: never javascript:, file: or data: URLs. */
export const isSafeUrl = (u: string) => /^(https?:\/\/|mailto:)[^\s]+$/i.test(u)
const MAX_POINTS = 100000

const CHECKS: Record<string, (a: Record<string, unknown>) => boolean> = {
  highlight: (a) => Array.isArray(a.quads) && a.quads.length <= 5000 && a.quads.every(rect) && color(a.color) && unit(a.opacity),
  underline: (a) => CHECKS.highlight(a),
  strikethrough: (a) => CHECKS.highlight(a),
  freehand: (a) => Array.isArray(a.points) && a.points.length <= MAX_POINTS && a.points.every(point) && stroke(a.style),
  rectangle: (a) => rect(a.bounds) && num(a.rotation) && stroke(a.stroke) && (a.fill === null || (isObj(a.fill) && color(a.fill.color) && unit(a.fill.opacity))),
  ellipse: (a) => CHECKS.rectangle(a),
  line: (a) => point(a.start) && point(a.end) && stroke(a.style),
  arrow: (a) => CHECKS.line(a),
  text: (a) =>
    rect(a.bounds) && num(a.rotation) && str(a.text) && isObj(a.style) && color(a.style.color) && str(a.style.fontFamily, 100) &&
    num(a.style.fontSize) && a.style.fontSize > 0 && a.style.fontSize <= 500 && ['left', 'center', 'right'].includes(a.style.align as string),
  textedit: (a) =>
    rect(a.bounds) && str(a.text) && str(a.originalText) && color(a.coverColor) && isObj(a.style) && color(a.style.color) && str(a.style.fontFamily, 100) &&
    num(a.style.fontSize) && a.style.fontSize > 0 && a.style.fontSize <= 500 && ['left', 'center', 'right'].includes(a.style.align as string),
  note: (a) => point(a.position) && str(a.text) && color(a.color),
  stamp: (a) => ['APPROVED', 'CONFIDENTIAL', 'DRAFT', 'PAID'].includes(a.stamp as string) && rect(a.bounds) && num(a.rotation),
  signature: (a) => str(a.signatureId, 100) && rect(a.bounds) && num(a.rotation),
  link: (a) => rect(a.bounds) && str(a.url, 2048) && (a.url === '' || isSafeUrl(a.url as string)) && (a.targetPageId === null || str(a.targetPageId, 100)),
  field: (a) =>
    rect(a.bounds) && ['text', 'checkbox', 'dropdown'].includes(a.fieldType as string) && str(a.name, 200) && Array.isArray(a.options) &&
    a.options.length <= 200 && a.options.every((o) => str(o, 200)),
  image: (a) =>
    rect(a.bounds) && num(a.rotation) && (a.mime === 'image/png' || a.mime === 'image/jpeg') &&
    str(a.dataUrl, 30_000_000) && (a.dataUrl as string).startsWith(`data:${a.mime as string};base64,`),
  redaction: (a) => rect(a.bounds),
}

/**
 * Validates untrusted JSON before it touches the document. Unknown types, bad numbers, oversized
 * arrays and out-of-range page references are all rejected; ids are regenerated so an import
 * can never collide with or overwrite existing annotations.
 */
export function importAnnotations(raw: unknown, pages: readonly PageRef[]): Result<Annotation[]> {
  if (!isObj(raw)) return bad('That file is not an annotation export.')
  if (raw.schemaVersion !== ANNOTATION_SCHEMA_VERSION) return bad(`Unsupported annotation format version (expected ${ANNOTATION_SCHEMA_VERSION}).`)
  if (!Array.isArray(raw.annotations)) return bad('The file has no annotations list.')
  if (raw.annotations.length > 20000) return bad('The file contains too many annotations.')
  const out: Annotation[] = []
  const now = Date.now()
  for (const [i, item] of raw.annotations.entries()) {
    if (!isObj(item) || typeof item.type !== 'string' || !(item.type in CHECKS)) return bad(`Annotation ${i + 1} has an unknown type.`)
    if (!CHECKS[item.type](item)) return bad(`Annotation ${i + 1} (${item.type}) has invalid fields.`)
    const page = item.pageIndex
    if (!Number.isInteger(page) || (page as number) < 0 || (page as number) >= pages.length) return bad(`Annotation ${i + 1} points to a page this document doesn't have.`)
    const { pageIndex: _pi, id: _id, ...rest } = item
    // A page link's target is a PageId from the exporting session; keep it only if it still names a page here.
    if (rest.type === 'link' && rest.targetPageId && !pages.some((p) => p.pageId === rest.targetPageId)) rest.targetPageId = null
    out.push({ ...rest, id: newId<AnnotationId>(), pageId: pages[page as number].pageId, zIndex: num(item.zIndex) ? item.zIndex : i, createdAt: now, updatedAt: now } as Annotation)
  }
  return ok(out)
}
