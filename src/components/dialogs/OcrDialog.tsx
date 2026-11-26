import { useRef, useState } from 'react'
import { createPageTransform } from '../../lib/geometry/transform'
import { parsePageRange } from '../../lib/pdf/pageRange'
import { useDocument } from '../../stores/document'
import { useOcr } from '../../stores/ocr'
import type { OcrWord } from '../../stores/ocr'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import type { Rotation } from '../../types'
import { Modal } from '../common/Modal'

const LANGS = [
  ['eng', 'English'],
  ['khm', 'Khmer'],
  ['eng+khm', 'English + Khmer'],
] as const
const SCALE = 2

interface Recognizer {
  recognize: (i: unknown, o?: unknown, out?: unknown) => Promise<{ data: any }>
  terminate: () => Promise<unknown>
}

interface TessWord { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }
type TessBlocks = { paragraphs: { lines: { words: TessWord[] }[] }[] }[]

const wordsOf = (data: { words?: TessWord[]; blocks?: TessBlocks | null }): TessWord[] =>
  data.words ?? data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) ?? []

export function OcrDialog() {
  const close = useUI((s) => s.close)
  const doc = useViewer((s) => s.doc)
  const pages = useDocument((s) => s.pages)
  const done = useOcr((s) => s.words)
  const [lang, setLang] = useState<string>('eng')
  const [range, setRange] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelled = useRef(false)
  const stop = useRef<(() => void) | null>(null)
  if (!doc) return null

  const run = async () => {
    setError(null)
    let indexes = Array.from({ length: doc.numPages }, (_, i) => i)
    if (range.trim()) {
      const r = parsePageRange(range, doc.numPages)
      if (!r.ok) return setError(r.error.message)
      indexes = [...r.value]
    }
    cancelled.current = false
    setBusy(true)
    setProgress(0)
    setStatus('Loading OCR engine… (first use downloads nothing: it ships with the app)')
    let worker = null as Recognizer | null
    try {
      const { createWorker } = await import('tesseract.js')
      const w = (await createWorker(lang, 1, { workerPath: '/ocr/worker.min.js', corePath: '/ocr', langPath: '/ocr/lang', gzip: true, workerBlobURL: false })) as unknown as Recognizer
      worker = w
      stop.current = () => void w.terminate()
      for (const [n, index] of indexes.entries()) {
        if (cancelled.current) break
        setStatus(`Recognizing page ${index + 1} (${n + 1} of ${indexes.length})…`)
        const page = await doc.getPage(index + 1)
        const viewport = page.getViewport({ scale: SCALE, rotation: page.rotate })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        await page.render({ canvas, viewport }).promise
        const { data } = await w.recognize(canvas, {}, { blocks: true })
        const [x0, y0, x1, y1] = page.view
        const t = createPageTransform({ pageSize: { width: x1 - x0, height: y1 - y0 }, rotation: (page.rotate % 360) as Rotation, scale: SCALE })
        const words: OcrWord[] = wordsOf(data)
          .filter((w) => w.text.trim())
          .map((w) => ({ text: w.text, ...t.rectToPage({ x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 }) }))
        const id = pages[index]?.pageId
        if (id) useOcr.getState().setPage(id, words)
        page.cleanup()
        canvas.width = 0
        setProgress((n + 1) / indexes.length)
      }
      setStatus(cancelled.current ? 'Cancelled. Pages finished so far were kept.' : 'Done. The text layer will be added when you export.')
    } catch (e) {
      if (!cancelled.current) setError('OCR failed. Language data may be missing from this build — see the README.')
      void e
    } finally {
      await worker?.terminate().catch(() => undefined)
      stop.current = null
      setBusy(false)
    }
  }

  const total = [...done.values()].reduce((n, w) => n + w.length, 0)
  const preview = [...done.entries()].slice(0, 3).map(([id, w]) => `Page ${pages.findIndex((p) => p.pageId === id) + 1}: ${w.map((x) => x.text).join(' ')}`).join('\n\n')

  return (
    <Modal title="OCR (recognize text in scans)" onClose={() => { cancelled.current = true; stop.current?.(); close() }}>
      <div className="flex flex-col gap-3">
        <p className="text-muted">Runs entirely in your browser. Recognized text is added to the exported PDF as an invisible, searchable layer.</p>
        <label className="flex items-center justify-between gap-2">Language
          <select value={lang} onChange={(e) => setLang(e.target.value)} disabled={busy} className="rounded border border-border bg-bg px-2 py-1">{LANGS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        </label>
        <label className="flex items-center justify-between gap-2">Pages (blank = all)
          <input value={range} onChange={(e) => setRange(e.target.value)} disabled={busy} placeholder="1-3, 5" className="w-40 rounded border border-border bg-bg px-2 py-1" />
        </label>
        {busy && <progress value={progress} max={1} aria-label="OCR progress" className="w-full" />}
        {status && <p role="status" className="text-muted">{status}</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {total > 0 && (
          <details>
            <summary className="cursor-pointer">{done.size} page{done.size === 1 ? '' : 's'} recognized, {total} words</summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-xs">{preview}</pre>
            <button type="button" onClick={() => void navigator.clipboard?.writeText([...done.values()].map((w) => w.map((x) => x.text).join(' ')).join('\n\n'))} className="mt-1 text-xs underline">Copy all text</button>
          </details>
        )}
        <p className="text-xs text-muted">Exported text uses the standard Latin font set: characters outside it (including Khmer) are searchable only in the on-screen results here, not embedded as PDF text.</p>
        <div className="flex justify-end gap-2">
          {busy ? <button type="button" onClick={() => { cancelled.current = true; stop.current?.() }} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Cancel</button> : <button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Close</button>}
          <button type="button" disabled={busy} onClick={() => void run()} className="rounded-md bg-accent px-4 py-1.5 font-medium text-accent-text disabled:opacity-50">Start OCR</button>
        </div>
      </div>
    </Modal>
  )
}
