import { BlendMode, LineCapStyle, PDFHexString, PDFString, StandardFonts, degrees, rgb } from 'pdf-lib'
import type { PDFDocument, PDFFont, PDFImage, PDFPage, PDFRef } from 'pdf-lib'
import { STAMP_COLORS } from '../annotations/stamps'
import { textEditOrigin } from '../annotations/style'
import { err, ok } from '../../types'
import type {
  Annotation, ExportRequest, ExportResult, PagePoint, PageRef, Result, SignatureId, TextStyle,
} from '../../types'
import { compressImages, stripMetadata } from './compress'
import type { Recoder } from './compress'
import { applyFormValues } from './forms'
import { isSafeUrl } from '../annotations/io'
import { applyDecorations } from './decorate'
import { appendBookmarks } from './outline'
import { loadPdfLib } from './pageOps'
import type { TextRasterizer } from './rasterText'

const hex = (c: string) => {
  const n = parseInt(c.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** 1×1 transparent PNG, used for blank lines so line indexes stay aligned. */
const EMPTY_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

const rad = (deg: number) => (deg * Math.PI) / 180
/** Rotate `p` clockwise (page space is y-down) by `deg` about `pivot`. */
const rotateAbout = (p: PagePoint, pivot: PagePoint, deg: number): PagePoint => {
  const c = Math.cos(rad(deg))
  const s = Math.sin(rad(deg))
  const dx = p.x - pivot.x
  const dy = p.y - pivot.y
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c }
}

/** Standard fonts only cover WinAnsi; anything else becomes "?" rather than failing the export. */
const safeText = (font: PDFFont, text: string) => {
  const set = new Set(font.getCharacterSet())
  return Array.from(text, (ch) => (ch === '\n' || set.has(ch.codePointAt(0)!) ? ch : '?')).join('')
}

const hasUnsupported = (font: PDFFont, text: string) => {
  const set = new Set(font.getCharacterSet())
  return Array.from(text).some((ch) => ch !== '\n' && !set.has(ch.codePointAt(0)!))
}

function wrap(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (line && measure(next) > maxWidth) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

interface Ctx {
  doc: PDFDocument
  page: PDFPage
  fonts: Record<string, PDFFont>
  /** Page-space (top-left origin) → PDF user space. */
  toPdf: (p: PagePoint) => { x: number; y: number }
  images: Map<SignatureId, PDFImage>
  /** Page object of a target page (for page links); undefined if it was deleted. */
  pageRefOf: (id: PageRef['pageId']) => PDFRef | undefined
  /** Placed pictures, keyed by annotation id. */
  pictures: Map<string, PDFImage>
  /** Pre-rendered lines for text in scripts the standard fonts lack (e.g. Khmer), keyed by annotation. */
  raster: Map<string, { image: PDFImage; width: number; height: number }[]>
}

function fontFor(ctx: Ctx, style: Pick<TextStyle, 'fontFamily'>, bold = false) {
  const f = style.fontFamily.toLowerCase()
  const key = f.includes('courier') || f.includes('mono') ? 'mono' : f.includes('times') || f.includes('serif') ? 'serif' : 'sans'
  return ctx.fonts[bold ? `${key}-bold` : key]
}

function pathOf(points: PagePoint[], close = false) {
  return points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + (close ? ' Z' : '')
}

function drawStroke(ctx: Ctx, d: string, color: string, width: number, opacity: number) {
  const o = ctx.toPdf({ x: 0, y: 0 })
  ctx.page.drawSvgPath(d, { x: o.x, y: o.y, borderColor: hex(color), borderWidth: width, borderOpacity: opacity, borderLineCap: LineCapStyle.Round })
}

function drawPolygon(ctx: Ctx, pts: PagePoint[], stroke: { color: string; width: number; opacity: number }, fill: { color: string; opacity: number } | null) {
  const o = ctx.toPdf({ x: 0, y: 0 })
  ctx.page.drawSvgPath(pathOf(pts, true), {
    x: o.x, y: o.y,
    borderColor: hex(stroke.color), borderWidth: stroke.width, borderOpacity: stroke.opacity,
    ...(fill ? { color: hex(fill.color), opacity: fill.opacity } : {}),
  })
}

const rectCorners = (b: { x: number; y: number; width: number; height: number }, rot: number): PagePoint[] => {
  const pivot = { x: b.x, y: b.y }
  return [
    { x: b.x, y: b.y }, { x: b.x + b.width, y: b.y }, { x: b.x + b.width, y: b.y + b.height }, { x: b.x, y: b.y + b.height },
  ].map((p) => rotateAbout(p, pivot, rot))
}

function drawAnnotation(ctx: Ctx, a: Annotation): void {
  switch (a.type) {
    case 'highlight':
      for (const q of a.quads) {
        const p = ctx.toPdf({ x: q.x, y: q.y + q.height })
        ctx.page.drawRectangle({ x: p.x, y: p.y, width: q.width, height: q.height, color: hex(a.color), opacity: a.opacity, blendMode: BlendMode.Multiply })
      }
      return
    case 'underline':
    case 'strikethrough':
      for (const q of a.quads) {
        const y = a.type === 'underline' ? q.y + q.height : q.y + q.height / 2
        drawStroke(ctx, pathOf([{ x: q.x, y }, { x: q.x + q.width, y }]), a.color, Math.max(1, q.height / 12), a.opacity)
      }
      return
    case 'freehand':
      if (a.points.length === 1) {
        const p = a.points[0]
        drawStroke(ctx, pathOf([p, { x: p.x + 0.01, y: p.y }]), a.style.color, a.style.width, a.style.opacity)
      } else if (a.points.length > 1) drawStroke(ctx, pathOf([...a.points]), a.style.color, a.style.width, a.style.opacity)
      return
    case 'rectangle':
      drawPolygon(ctx, rectCorners(a.bounds, a.rotation), a.stroke, a.fill)
      return
    case 'ellipse': {
      const { x, y, width: w, height: h } = a.bounds
      const pts = Array.from({ length: 72 }, (_, i) => {
        const t = (i / 72) * Math.PI * 2
        return rotateAbout({ x: x + w / 2 + (w / 2) * Math.cos(t), y: y + h / 2 + (h / 2) * Math.sin(t) }, { x, y }, a.rotation)
      })
      drawPolygon(ctx, pts, a.stroke, a.fill)
      return
    }
    case 'line':
    case 'arrow': {
      let d = pathOf([a.start, a.end])
      if (a.type === 'arrow') {
        const ang = Math.atan2(a.end.y - a.start.y, a.end.x - a.start.x)
        const head = Math.max(8, a.style.width * 4)
        const side = (s: number): PagePoint => ({ x: a.end.x - head * Math.cos(ang + s * 0.45), y: a.end.y - head * Math.sin(ang + s * 0.45) })
        d += ` ${pathOf([side(1), a.end, side(-1)])}`
      }
      drawStroke(ctx, d, a.style.color, a.style.width, a.style.opacity)
      return
    }
    case 'text': {
      const font = fontFor(ctx, a.style)
      const size = a.style.fontSize
      const pivot = { x: a.bounds.x, y: a.bounds.y }
      const shaped = ctx.raster.get(a.id)
      if (shaped) {
        shaped.forEach((line, i) => {
          const dx = a.style.align === 'center' ? (a.bounds.width - line.width) / 2 : a.style.align === 'right' ? a.bounds.width - line.width : 0
          const base = rotateAbout({ x: a.bounds.x + dx, y: a.bounds.y + i * size * 1.2 - size * 0.1 + line.height }, pivot, a.rotation)
          const p = ctx.toPdf(base)
          ctx.page.drawImage(line.image, { x: p.x, y: p.y, width: line.width, height: line.height, rotate: degrees(-a.rotation) })
        })
        return
      }
      const lines = wrap((t) => font.widthOfTextAtSize(t, size), safeText(font, a.text), a.bounds.width)
      lines.forEach((line, i) => {
        const w = font.widthOfTextAtSize(line, size)
        const dx = a.style.align === 'center' ? (a.bounds.width - w) / 2 : a.style.align === 'right' ? a.bounds.width - w : 0
        const base = rotateAbout({ x: a.bounds.x + dx, y: a.bounds.y + size * 0.95 + i * size * 1.2 }, pivot, a.rotation)
        const p = ctx.toPdf(base)
        ctx.page.drawText(line, { x: p.x, y: p.y, size, font, color: hex(a.style.color), rotate: degrees(-a.rotation) })
      })
      return
    }
    case 'textedit': {
      const b = a.bounds
      const corner = ctx.toPdf({ x: b.x, y: b.y + b.height })
      ctx.page.drawRectangle({ x: corner.x, y: corner.y, width: b.width, height: b.height, color: hex(a.coverColor) })
      const font = fontFor(ctx, a.style)
      const size = a.style.fontSize
      const origin = textEditOrigin(b, size)
      const shaped = ctx.raster.get(a.id)
      if (shaped) {
        shaped.forEach((line, i) => {
          const p = ctx.toPdf({ x: origin.x, y: origin.y + i * size * 1.2 - size * 0.1 + line.height })
          ctx.page.drawImage(line.image, { x: p.x, y: p.y, width: line.width, height: line.height })
        })
        return
      }
      safeText(font, a.text).split('\n').forEach((line, i) => {
        if (!line) return
        const p = ctx.toPdf({ x: origin.x, y: origin.y + size * 0.95 + i * size * 1.2 })
        ctx.page.drawText(line, { x: p.x, y: p.y, size, font, color: hex(a.style.color) })
      })
      return
    }
    case 'note': {
      const p = ctx.toPdf(a.position)
      const rect = [p.x, p.y - 20, p.x + 20, p.y]
      const c = hex(a.color)
      const annot = ctx.doc.context.obj({
        Type: 'Annot', Subtype: 'Text', Name: 'Comment', F: 4,
        Rect: rect, C: [c.red, c.green, c.blue],
        Contents: PDFHexString.fromText(a.text),
      })
      ctx.page.node.addAnnot(ctx.doc.context.register(annot))
      return
    }
    case 'stamp': {
      const color = hex(STAMP_COLORS[a.stamp])
      const font = ctx.fonts['sans-bold']
      const b = a.bounds
      drawPolygon(ctx, rectCorners(b, a.rotation), { color: STAMP_COLORS[a.stamp], width: 2, opacity: 0.9 }, null)
      const size = Math.min(b.height * 0.5, (b.width * 0.85 * 1) / (font.widthOfTextAtSize(a.stamp, 1)))
      const w = font.widthOfTextAtSize(a.stamp, size)
      const base = rotateAbout({ x: b.x + (b.width - w) / 2, y: b.y + b.height / 2 + size * 0.35 }, { x: b.x, y: b.y }, a.rotation)
      const p = ctx.toPdf(base)
      ctx.page.drawText(a.stamp, { x: p.x, y: p.y, size, font, color, rotate: degrees(-a.rotation), opacity: 0.9 })
      return
    }
    case 'signature': {
      const img = ctx.images.get(a.signatureId)
      if (!img) return
      const bl = rotateAbout({ x: a.bounds.x, y: a.bounds.y + a.bounds.height }, { x: a.bounds.x, y: a.bounds.y }, a.rotation)
      const p = ctx.toPdf(bl)
      ctx.page.drawImage(img, { x: p.x, y: p.y, width: a.bounds.width, height: a.bounds.height, rotate: degrees(-a.rotation) })
      return
    }
    case 'image': {
      const img = ctx.pictures.get(a.id)
      if (!img) return
      const bl = rotateAbout({ x: a.bounds.x, y: a.bounds.y + a.bounds.height }, { x: a.bounds.x, y: a.bounds.y }, a.rotation)
      const p = ctx.toPdf(bl)
      ctx.page.drawImage(img, { x: p.x, y: p.y, width: a.bounds.width, height: a.bounds.height, rotate: degrees(-a.rotation) })
      return
    }
    case 'link': {
      const p = ctx.toPdf({ x: a.bounds.x, y: a.bounds.y + a.bounds.height })
      const rect = [p.x, p.y, p.x + a.bounds.width, p.y + a.bounds.height]
      const target = a.targetPageId ? ctx.pageRefOf(a.targetPageId) : undefined
      const action = target
        ? { Dest: [target, 'Fit'] }
        : a.url && isSafeUrl(a.url) ? { A: { S: 'URI', URI: PDFString.of(a.url) } } : null
      if (!action) return // empty or unsafe target: nothing useful to write
      ctx.page.node.addAnnot(ctx.doc.context.register(ctx.doc.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: rect, Border: [0, 0, 0], F: 4, ...action })))
      return
    }
    case 'field': {
      const form = ctx.doc.getForm()
      let name = a.name.trim() || a.fieldType
      for (let n = 2; form.getFieldMaybe(name); n++) name = `${a.name.trim() || a.fieldType}_${n}`
      const p = ctx.toPdf({ x: a.bounds.x, y: a.bounds.y + a.bounds.height })
      const where = { x: p.x, y: p.y, width: a.bounds.width, height: a.bounds.height }
      const look = { borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 }
      if (a.fieldType === 'text') form.createTextField(name).addToPage(ctx.page, { ...where, ...look })
      else if (a.fieldType === 'checkbox') form.createCheckBox(name).addToPage(ctx.page, { ...where, ...look })
      else {
        const dd = form.createDropdown(name)
        dd.addOptions(a.options.filter(Boolean).map((o) => safeText(ctx.fonts.sans, o)))
        dd.addToPage(ctx.page, { ...where, ...look, font: ctx.fonts.sans })
      }
      return
    }
    case 'redaction':
      // Guarded in exportPdf; a marker must never reach output as if it were redaction.
      throw new Error('Unapplied redaction reached the exporter')
  }
}

export interface ExportOptions {
  /** Browser-only image re-encoder; omit to skip image downsampling. */
  recode?: Recoder
  /** Browser-only text shaper; without it, characters outside WinAnsi export as "?". */
  rasterizer?: TextRasterizer
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * Writes annotations into standard PDF content so any viewer shows them
 * (notes become real /Text annotations; everything else is drawn on the page).
 */
export async function exportPdf(req: ExportRequest, opts: ExportOptions = {}): Promise<Result<ExportResult>> {
  if (req.annotations.some((a) => a.type === 'redaction')) {
    return err({ code: 'REDACTION_UNSAFE', message: 'Apply or remove redaction marks before exporting; a marker is not redaction.' })
  }
  const loaded = await loadPdfLib(req.source)
  if (!loaded.ok) return loaded
  const doc = loaded.value

  if (req.formValues) {
    const filled = applyFormValues(doc, req.formValues)
    if (!filled.ok) return filled
  }

  const fonts: Ctx['fonts'] = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    'sans-bold': await doc.embedFont(StandardFonts.HelveticaBold),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    'serif-bold': await doc.embedFont(StandardFonts.TimesRomanBold),
    mono: await doc.embedFont(StandardFonts.Courier),
    'mono-bold': await doc.embedFont(StandardFonts.CourierBold),
  }

  const images = new Map<SignatureId, PDFImage>()
  for (const a of req.annotations) {
    if (a.type !== 'signature' || images.has(a.signatureId)) continue
    const sig = req.signatures.get(a.signatureId)
    if (!sig) continue
    images.set(a.signatureId, sig.mime === 'image/png' ? await doc.embedPng(sig.bytes) : await doc.embedJpg(sig.bytes))
  }

  const pictures = new Map<string, PDFImage>()
  const byUrl = new Map<string, PDFImage>()
  for (const a of req.annotations) {
    if (a.type !== 'image') continue
    let img = byUrl.get(a.dataUrl)
    if (!img) {
      const bytes = Uint8Array.from(atob(a.dataUrl.slice(a.dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
      img = a.mime === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
      byUrl.set(a.dataUrl, img)
    }
    pictures.set(a.id, img)
  }

  const raster: Ctx['raster'] = new Map()
  if (opts.rasterizer) {
    for (const a of req.annotations) {
      if (a.type !== 'text' && a.type !== 'textedit') continue
      const font = fonts[a.style.fontFamily.toLowerCase().includes('courier') || a.style.fontFamily.toLowerCase().includes('mono') ? 'mono' : a.style.fontFamily.toLowerCase().includes('times') || a.style.fontFamily.toLowerCase().includes('serif') ? 'serif' : 'sans']
      if (!hasUnsupported(font, a.text)) continue
      const size = a.style.fontSize
      const family = a.style.fontFamily
      const lines = a.type === 'text'
        ? wrap((t) => opts.rasterizer!.measure(t, size, family), a.text, a.bounds.width)
        : a.text.split('\n')
      const out: { image: PDFImage; width: number; height: number }[] = []
      for (const line of lines) {
        const r = line.trim() ? await opts.rasterizer.render(line, size, family, a.style.color) : null
        if (r) out.push({ image: await doc.embedPng(r.bytes), width: r.width, height: r.height })
        else out.push({ image: await doc.embedPng(EMPTY_PNG), width: 1, height: 1 })
      }
      raster.set(a.id, out)
    }
  }

  const indexOf = new Map<PageRef['pageId'], number>(req.pages.map((p, i) => [p.pageId, i]))
  const pdfPages = doc.getPages()
  const done = new Set<number>()
  let n = 0
  for (const a of [...req.annotations].sort((x, y) => x.zIndex - y.zIndex)) {
    if (opts.signal?.aborted) return err({ code: 'CANCELLED', message: 'Export cancelled' })
    const i = indexOf.get(a.pageId)
    const page = i === undefined ? undefined : pdfPages[i]
    if (!page) continue
    const box = page.getCropBox()
    const ctx: Ctx = { doc, page, fonts, images, toPdf: (p) => ({ x: box.x + p.x, y: box.y + box.height - p.y }), pictures, raster, pageRefOf: (id) => { const j = indexOf.get(id); return j === undefined ? undefined : pdfPages[j]?.ref } }
    drawAnnotation(ctx, a)
    done.add(i!)
    opts.onProgress?.(0.5 * (++n / req.annotations.length))
  }

  if (req.ocrLayer) {
    for (const [pageId, words] of req.ocrLayer) {
      const i = indexOf.get(pageId)
      const page = i === undefined ? undefined : pdfPages[i]
      if (!page) continue
      const box = page.getCropBox()
      for (const w of words) {
        const text = safeText(fonts.sans, w.text).replace(/\n/g, ' ')
        if (!text.trim()) continue
        // Fully transparent text: invisible, but selectable and searchable in standard viewers.
        page.drawText(text, { x: box.x + w.x, y: box.y + box.height - (w.y + w.height * 0.8), size: Math.max(1, w.height * 0.8), font: fonts.sans, opacity: 0 })
      }
    }
  }

  if (req.decorations) await applyDecorations(doc, req.pages, req.decorations)

  if (req.bookmarks?.length) {
    appendBookmarks(doc, req.bookmarks.flatMap((b) => {
      const pageIndex = indexOf.get(b.pageId)
      return pageIndex === undefined ? [] : [{ title: b.title, pageIndex }]
    }))
  }

  if (req.compression) {
    if (req.compression.stripMetadata) stripMetadata(doc)
    if (opts.recode) await compressImages(doc, req.compression, opts.recode)
  }

  if (req.metadata) {
    const m = req.metadata
    if (m.title !== undefined) doc.setTitle(m.title)
    if (m.author !== undefined) doc.setAuthor(m.author)
    if (m.subject !== undefined) doc.setSubject(m.subject)
    if (m.keywords !== undefined) doc.setKeywords(m.keywords.split(',').map((k) => k.trim()).filter(Boolean))
  }

  opts.onProgress?.(0.9)
  const bytes = await doc.save({ useObjectStreams: true, updateFieldAppearances: !!req.formValues || req.annotations.some((a) => a.type === 'field') })
  opts.onProgress?.(1)
  const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  return ok({ bytes: out, originalSize: req.source.byteLength, exportedSize: out.byteLength })
}
