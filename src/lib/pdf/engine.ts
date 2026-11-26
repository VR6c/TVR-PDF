import type { PDFDocumentProxy } from 'pdfjs-dist'
import { err, ok } from '../../types'
import type { AppError, Result } from '../../types'

/** PDF.js is large, so it loads on first use rather than with the app shell. */
let loading: Promise<typeof import('pdfjs-dist')> | null = null
export function loadPdfjs() {
  loading ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default
    return lib
  })
  return loading
}

export interface OpenOptions {
  password?: string
  signal?: AbortSignal
}

const failure = (code: AppError['code'], message: string) => err({ code, message })

/**
 * Opens a PDF entirely in the browser. PDF.js transfers the buffer to its worker,
 * so it gets a copy and the caller keeps the original bytes (needed later for
 * persistence and export). Password and format problems are returned, not thrown.
 */
export async function openPdf(bytes: ArrayBuffer, opts: OpenOptions = {}): Promise<Result<PDFDocumentProxy>> {
  const { getDocument, PasswordResponses } = await loadPdfjs()
  const task = getDocument({ data: new Uint8Array(bytes.slice(0)), password: opts.password })
  opts.signal?.addEventListener('abort', () => void task.destroy(), { once: true })
  try {
    return ok(await task.promise)
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    if (opts.signal?.aborted) return failure('CANCELLED', 'Open cancelled')
    if (name === 'PasswordException') {
      const code = (e as { code?: number }).code
      return code === PasswordResponses.INCORRECT_PASSWORD
        ? failure('PASSWORD_INCORRECT', 'Incorrect password')
        : failure('PASSWORD_REQUIRED', 'Password required')
    }
    if (name === 'InvalidPDFException') return failure('INVALID_PDF', 'Not a valid PDF file')
    if (name === 'FormatError' || name === 'MissingPDFException') return failure('CORRUPTED_PDF', 'The PDF is damaged')
    return failure('INTERNAL', 'Could not open the PDF')
  }
}

export interface OutlineNode {
  title: string
  pageIndex: number | null
  children: OutlineNode[]
}

type RawOutline = { title: string; dest: string | unknown[] | null; items: RawOutline[] }

export async function loadOutline(doc: PDFDocumentProxy): Promise<OutlineNode[]> {
  const raw = (await doc.getOutline()) as RawOutline[] | null
  if (!raw) return []
  const resolve = async (dest: RawOutline['dest']): Promise<number | null> => {
    try {
      const explicit = typeof dest === 'string' ? await doc.getDestination(dest) : dest
      const ref = explicit?.[0]
      if (ref && typeof ref === 'object') return await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0])
      return typeof ref === 'number' ? ref : null
    } catch {
      return null
    }
  }
  const walk = (items: RawOutline[]): Promise<OutlineNode[]> =>
    Promise.all(
      items.map(async (i) => ({ title: i.title, pageIndex: await resolve(i.dest), children: await walk(i.items) })),
    )
  return walk(raw)
}

export interface SearchHit {
  pageIndex: number
  snippet: string
  /** Where the match sits on the page, in unrotated top-left page space (PDF points). Empty if it spans text runs. */
  rects: { x: number; y: number; width: number; height: number }[]
}

/** Streams hits page by page so the UI can show results while the scan continues. */
export async function searchDocument(
  doc: PDFDocumentProxy,
  query: string,
  signal: AbortSignal,
  onHits: (hits: SearchHit[], scanned: number) => void,
): Promise<void> {
  const needle = query.toLowerCase()
  for (let i = 0; i < doc.numPages; i++) {
    if (signal.aborted) return
    const page = await doc.getPage(i + 1)
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1, rotation: 0 })
    // Same joined text as before (runs separated by a space), remembering where each run starts.
    const runs: { start: number; str: string; transform: number[]; width: number; height: number }[] = []
    let text = ''
    for (const it of content.items) {
      if (!('str' in it)) continue
      if (runs.length) text += ' '
      runs.push({ start: text.length, str: it.str, transform: it.transform, width: it.width, height: it.height })
      text += it.str
    }
    const lower = text.toLowerCase()
    const hits: SearchHit[] = []
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, at + needle.length)) {
      const end = at + needle.length
      const run = runs.findLast((r) => r.start <= at)
      const rects: SearchHit['rects'] = []
      if (run && end <= run.start + run.str.length && run.str.length) {
        const from = at - run.start
        const x = run.transform[4] + (run.width * from) / run.str.length
        const w = (run.width * needle.length) / run.str.length
        const y = run.transform[5]
        const [a, b, c, d, e, f] = viewport.transform
        const map = (px: number, py: number) => ({ x: a * px + c * py + e, y: b * px + d * py + f })
        const p1 = map(x, y)
        const p2 = map(x + w, y + run.height)
        rects.push({ x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), width: Math.abs(p2.x - p1.x), height: Math.abs(p2.y - p1.y) })
      }
      hits.push({ pageIndex: i, snippet: text.slice(Math.max(0, at - 30), at + needle.length + 40).trim(), rects })
    }
    page.cleanup()
    onHits(hits, i + 1)
  }
}
