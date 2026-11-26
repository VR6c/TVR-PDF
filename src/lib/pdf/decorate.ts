import { StandardFonts, degrees, rgb } from 'pdf-lib'
import type { PDFDocument } from 'pdf-lib'
import type { PageDecorations, PageRef } from '../../types'

const MARGIN = 28

/** `{n}` → page number, `{total}` → page count; anything else is kept literally. */
export const fillTemplate = (template: string, n: number, total: number) =>
  template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total))

/** Standard fonts only cover WinAnsi; unsupported characters become "?" rather than failing. */
const latin = (text: string) => Array.from(text, (ch) => (ch.codePointAt(0)! <= 0xff ? ch : '?')).join('')

/**
 * Stamps a watermark, header, footer and/or page numbers onto every page.
 * `pages` is the final page list, so page numbers match what the user sees.
 */
export async function applyDecorations(doc: PDFDocument, pages: readonly PageRef[], d: PageDecorations): Promise<void> {
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const total = doc.getPageCount()
  const grey = rgb(0.25, 0.25, 0.25)

  doc.getPages().forEach((page, i) => {
    if (i >= pages.length && pages.length) return
    const box = page.getCropBox()
    const place = (text: string, where: 'left' | 'center' | 'right', y: number, size = 10) => {
      const t = latin(text)
      const w = font.widthOfTextAtSize(t, size)
      const x = where === 'left' ? box.x + MARGIN : where === 'right' ? box.x + box.width - MARGIN - w : box.x + (box.width - w) / 2
      page.drawText(t, { x, y, size, font, color: grey })
    }

    if (d.watermark?.text.trim()) {
      const text = latin(d.watermark.text.trim())
      const size = Math.min(120, Math.max(24, (box.width * 0.8) / Math.max(1, bold.widthOfTextAtSize(text, 1))))
      const w = bold.widthOfTextAtSize(text, size)
      const a = Math.atan2(box.height, box.width)
      // Centre the rotated text on the page.
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      page.drawText(text, {
        x: cx - (w / 2) * Math.cos(a) + (size * 0.35) * Math.sin(a),
        y: cy - (w / 2) * Math.sin(a) - (size * 0.35) * Math.cos(a),
        size, font: bold, color: rgb(0.6, 0.6, 0.6), opacity: d.watermark.opacity, rotate: degrees((a * 180) / Math.PI),
      })
    }
    if (d.header?.trim()) place(fillTemplate(d.header, i + 1, total), 'center', box.y + box.height - MARGIN)
    if (d.footer?.trim()) place(fillTemplate(d.footer, i + 1, total), 'center', box.y + MARGIN - 8)
    if (d.pageNumbers) {
      place(fillTemplate(d.pageNumbers.format, i + 1, total), d.pageNumbers.position, box.y + MARGIN - 8 + (d.footer?.trim() && d.pageNumbers.position === 'center' ? -12 : 0))
    }
  })
}
