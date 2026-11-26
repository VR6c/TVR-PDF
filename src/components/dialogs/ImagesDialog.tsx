import { useRef, useState } from 'react'
import { runExport } from '../../lib/exportActions'
import { openPdf } from '../../lib/pdf/engine'
import { parsePageRange } from '../../lib/pdf/pageRange'
import { makeZip } from '../../lib/zip'
import { useDocument } from '../../stores/document'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { Modal } from '../common/Modal'

/** Renders pages of the edited document (with annotations) to PNG or JPEG; several pages come as one ZIP. */
export function ImagesDialog() {
  const close = useUI((s) => s.close)
  const fileName = useViewer((s) => s.fileName)
  const currentPage = useViewer((s) => s.currentPage)
  const pageCount = useDocument((s) => s.pages.length)
  const marks = useDocument((s) => s.annotations.some((a) => a.type === 'redaction'))
  const [format, setFormat] = useState<'png' | 'jpeg'>('png')
  const [dpi, setDpi] = useState(150)
  const [range, setRange] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const base = fileName.replace(/\.pdf$/i, '')

  const go = async () => {
    const parsed = range.trim() ? parsePageRange(range, pageCount) : null
    if (parsed && !parsed.ok) return setMessage({ kind: 'error', text: parsed.error.message })
    const indexes = parsed?.ok ? [...parsed.value] : Array.from({ length: pageCount }, (_, i) => i)
    setBusy(true)
    setMessage(null)
    abort.current = new AbortController()
    const signal = abort.current.signal
    try {
      const exported = await runExport({ compress: false, maxImageDimension: 0, imageQuality: 0, stripMetadata: false, includeOcr: false, signal })
      if (!exported.ok) return exported.error.code !== 'CANCELLED' ? setMessage({ kind: 'error', text: exported.error.message }) : undefined
      const opened = await openPdf(exported.value.bytes)
      if (!opened.ok) return setMessage({ kind: 'error', text: opened.error.message })
      const pdf = opened.value
      const files: { name: string; data: Uint8Array }[] = []
      const pad = String(pageCount).length
      for (const [n, i] of indexes.entries()) {
        if (signal.aborted) return
        const page = await pdf.getPage(i + 1)
        const viewport = page.getViewport({ scale: dpi / 72 })
        // Keep pixel counts within what browsers can allocate.
        if (viewport.width * viewport.height > 120_000_000) return setMessage({ kind: 'error', text: 'That page is too large at this resolution. Choose a lower DPI.' })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, viewport }).promise
        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, `image/${format}`, 0.92))
        canvas.width = canvas.height = 0
        if (!blob) return setMessage({ kind: 'error', text: 'The browser could not encode that image.' })
        files.push({ name: `${base}-page-${String(i + 1).padStart(pad, '0')}.${format === 'png' ? 'png' : 'jpg'}`, data: new Uint8Array(await blob.arrayBuffer()) })
        setProgress((n + 1) / indexes.length)
      }
      void pdf.loadingTask.destroy()
      const one = files.length === 1
      const bytes = one ? files[0].data : makeZip(files)
      const how = await saveFile(bytes, one ? files[0].name : `${base}-images.zip`, one ? `image/${format}` : 'application/zip')
      if (how !== 'cancelled') setMessage({ kind: 'ok', text: `${files.length} image${one ? '' : 's'} ${how === 'saved' ? 'saved' : 'downloaded'}.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export pages as images" onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-muted">Pages are drawn with your annotations. Everything happens on this device.</p>
        {marks && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-800">Unapplied redaction marks would not be hidden. Apply or delete them first.</p>}
        <label className="flex items-center justify-between gap-2">Format
          <select value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'jpeg')} className="rounded border border-border bg-bg px-2 py-1">
            <option value="png">PNG (lossless)</option><option value="jpeg">JPEG (smaller)</option>
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">Resolution
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} className="rounded border border-border bg-bg px-2 py-1">
            {[72, 96, 150, 200, 300].map((d) => <option key={d} value={d}>{d} DPI</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-2">Pages
          <input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`all (1-${pageCount}), or e.g. ${currentPage}`} aria-label="Pages to export" className="w-48 rounded border border-border bg-bg px-2 py-1" />
        </label>
        {busy && <progress value={progress} max={1} aria-label="Progress" className="w-full" />}
        {message && <p role="status" className={`rounded border p-2 font-medium ${message.kind === 'error' ? 'border-red-400 text-red-500' : 'border-green-500 bg-surface-2 text-text'}`}>{message.kind === 'ok' ? '✓ ' : ''}{message.text}</p>}
        <div className="flex justify-end gap-2">
          {busy ? <button type="button" onClick={() => abort.current?.abort()} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Cancel</button> : <button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Close</button>}
          <button type="button" disabled={busy || marks} onClick={() => void go()} className="rounded-md bg-accent px-4 py-1.5 font-medium text-accent-text disabled:opacity-50">{busy ? 'Working…' : 'Export'}</button>
        </div>
      </div>
    </Modal>
  )
}

/** Saves any file type (saveBytes is PDF-specific). */
async function saveFile(bytes: Uint8Array, name: string, mime: string): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url) }, 60000)
  return 'downloaded'
}
