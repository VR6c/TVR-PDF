import { useState } from 'react'
import { diffLines, pageLines, pixelDiff } from '../../lib/compare'
import type { LineDiff } from '../../lib/compare'
import { openPdf } from '../../lib/pdf/engine'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { Modal } from '../common/Modal'

interface PageResult { page: number; text: LineDiff | null; pixels: number; image: string | null; note?: string }

const WIDTH = 560
/** Draws page `i` of `doc` at a fixed width onto a canvas, returning its pixels. */
async function raster(doc: import('pdfjs-dist').PDFDocumentProxy, i: number) {
  const page = await doc.getPage(i + 1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: WIDTH / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport }).promise
  return { canvas, ctx }
}

/** Compares the open document with another PDF, page by page: changed lines of text and a pixel-level visual diff. */
export function CompareDialog() {
  const close = useUI((s) => s.close)
  const doc = useViewer((s) => s.doc)
  const [results, setResults] = useState<PageResult[] | null>(null)
  const [other, setOther] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const pick = (file: File | undefined) => {
    if (!file || !doc) return
    void (async () => {
      setBusy(true); setError(null); setResults(null); setOther(file.name)
      const opened = await openPdf(await file.arrayBuffer())
      if (!opened.ok) { setBusy(false); return setError(opened.error.code === 'PASSWORD_REQUIRED' ? 'Password-protected files can’t be compared.' : opened.error.message) }
      const b = opened.value
      const out: PageResult[] = []
      for (let i = 0; i < Math.max(doc.numPages, b.numPages); i++) {
        if (i >= doc.numPages || i >= b.numPages) {
          out.push({ page: i + 1, text: null, pixels: 1, image: null, note: i >= b.numPages ? 'Only in the open document' : 'Only in the other PDF' })
          continue
        }
        const text = diffLines(await pageLines(doc, i), await pageLines(b, i))
        const [ra, rb] = [await raster(doc, i), await raster(b, i)]
        const w = Math.min(ra.canvas.width, rb.canvas.width)
        const h = Math.min(ra.canvas.height, rb.canvas.height)
        const da = ra.ctx.getImageData(0, 0, w, h)
        const db = rb.ctx.getImageData(0, 0, w, h)
        const img = new ImageData(w, h)
        const pixels = pixelDiff(da.data, db.data, img.data)
        let url: string | null = null
        if (pixels > 0) {
          const c = document.createElement('canvas')
          c.width = w; c.height = h
          c.getContext('2d')!.putImageData(img, 0, 0)
          url = c.toDataURL('image/png')
        }
        out.push({ page: i + 1, text, pixels, image: url, note: ra.canvas.height !== rb.canvas.height ? 'Page sizes differ' : undefined })
        ra.canvas.width = rb.canvas.width = 0
      }
      void b.loadingTask.destroy()
      setResults(out)
      setBusy(false)
    })()
  }

  const changed = results?.filter((r) => r.pixels > 0 || r.text?.added.length || r.text?.removed.length) ?? []
  return (
    <Modal title="Compare PDFs" onClose={close} wide>
      <div className="flex flex-col gap-3">
        <p className="text-muted">Compares the open document with another PDF, page by page. Nothing leaves this device.</p>
        <label className="flex items-center gap-2">Other PDF:
          <input type="file" accept="application/pdf,.pdf" aria-label="PDF to compare with" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {busy && <p role="status">Comparing with {other}…</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {results && (
          <>
            <p role="status" className="font-medium">{changed.length ? `${changed.length} of ${results.length} page${results.length === 1 ? '' : 's'} differ.` : 'No differences found.'}</p>
            <ul className="flex max-h-[50dvh] flex-col gap-1 overflow-y-auto">
              {changed.map((r) => (
                <li key={r.page} className="rounded border border-border">
                  <button type="button" aria-expanded={open === r.page} onClick={() => setOpen(open === r.page ? null : r.page)} className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-surface-2">
                    <span>Page {r.page}{r.note ? ` · ${r.note}` : ''}</span>
                    <span className="text-xs text-muted">{r.text ? `${r.text.removed.length} removed · ${r.text.added.length} added · ` : ''}{(r.pixels * 100).toFixed(1)}% pixels</span>
                  </button>
                  {open === r.page && (
                    <div className="grid gap-2 border-t border-border p-2 md:grid-cols-2">
                      <div className="text-xs">
                        {r.text?.removed.map((l, i) => <p key={`r${i}`} className="bg-red-50 text-red-800">− {l}</p>)}
                        {r.text?.added.map((l, i) => <p key={`a${i}`} className="bg-green-50 text-green-800">+ {l}</p>)}
                        {!r.text?.removed.length && !r.text?.added.length && <p className="text-muted">No text changes (visual only).</p>}
                      </div>
                      {r.image && <img src={r.image} alt={`Visual differences on page ${r.page}; changed areas are red`} className="w-full rounded border border-border" />}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex justify-end"><button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Close</button></div>
      </div>
    </Modal>
  )
}
