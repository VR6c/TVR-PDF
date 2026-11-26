import type { PDFDocumentProxy } from 'pdfjs-dist'

export interface LineDiff {
  removed: string[]
  added: string[]
}

const MAX_LCS = 2500

/** Lines only in `a` (removed) and only in `b` (added), via longest common subsequence. */
export function diffLines(a: readonly string[], b: readonly string[]): LineDiff {
  if (a.length > MAX_LCS || b.length > MAX_LCS) {
    // Too long for an exact diff: fall back to comparing as sets.
    const sa = new Set(a)
    const sb = new Set(b)
    return { removed: a.filter((l) => !sb.has(l)), added: b.filter((l) => !sa.has(l)) }
  }
  const w = b.length + 1
  const t = new Uint32Array((a.length + 1) * w)
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      t[i * w + j] = a[i] === b[j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1])
    }
  }
  const removed: string[] = []
  const added: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++ } else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) removed.push(a[i++])
    else added.push(b[j++])
  }
  while (i < a.length) removed.push(a[i++])
  while (j < b.length) added.push(b[j++])
  return { removed, added }
}

/** Text of one page as trimmed non-empty lines. */
export async function pageLines(doc: PDFDocumentProxy, pageIndex: number): Promise<string[]> {
  const page = await doc.getPage(pageIndex + 1)
  const content = await page.getTextContent()
  const lines: string[] = []
  let cur = ''
  for (const it of content.items) {
    if (!('str' in it)) continue
    cur += it.str
    if (it.hasEOL) { lines.push(cur); cur = '' }
  }
  lines.push(cur)
  page.cleanup()
  return lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** Fraction (0..1) of pixels that differ noticeably between two same-size RGBA buffers, plus a red-on-grey diff image. */
export function pixelDiff(a: Uint8ClampedArray, b: Uint8ClampedArray, out?: Uint8ClampedArray): number {
  let changed = 0
  const px = Math.min(a.length, b.length) / 4
  for (let p = 0; p < px; p++) {
    const o = p * 4
    const d = Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2])
    const diff = d > 48
    if (diff) changed++
    if (out) {
      const g = 255 - Math.round((255 - (a[o] + a[o + 1] + a[o + 2]) / 3) * 0.35)
      out[o] = diff ? 220 : g; out[o + 1] = diff ? 38 : g; out[o + 2] = diff ? 38 : g; out[o + 3] = 255
    }
  }
  return px ? changed / px : 0
}
