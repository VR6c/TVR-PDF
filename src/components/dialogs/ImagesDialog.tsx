import { useRef, useState } from 'react'
import { downloadBlob } from '../../lib/download'
import { runExport } from '../../lib/exportActions'
import { openPdf } from '../../lib/pdf/engine'
import { parsePageRange } from '../../lib/pdf/pageRange'
import { makeZip } from '../../lib/zip'
import { useDocument } from '../../stores/document'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { Button, DialogActions } from '../common/Button'
import { Select } from '../common/Select'
import { Modal } from '../common/Modal'
import { Notice } from '../common/Notice'

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
      downloadBlob(bytes as BlobPart, one ? files[0].name : `${base}-images.zip`, one ? `image/${format}` : 'application/zip')
      setMessage({ kind: 'ok', text: `${files.length} image${one ? '' : 's'} downloaded.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Export pages as images" onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-muted">Pages are drawn with your annotations. Everything happens on this device.</p>
        {marks && <Notice kind="error">Unapplied redaction marks would not be hidden. Apply or delete them first.</Notice>}
        <label className="flex items-center justify-between gap-2">Format
          <Select aria-label="Format" value={format} onChange={(v) => setFormat(v as 'png' | 'jpeg')} options={[{ value: 'png', label: 'PNG (lossless)' }, { value: 'jpeg', label: 'JPEG (smaller)' }]} />
        </label>
        <label className="flex items-center justify-between gap-2">Resolution
          <Select aria-label="Resolution" value={String(dpi)} onChange={(v) => setDpi(Number(v))} options={[72, 96, 150, 200, 300].map((d) => ({ value: String(d), label: `${d} DPI` }))} />
        </label>
        <label className="flex items-center justify-between gap-2">Pages
          <input value={range} onChange={(e) => setRange(e.target.value)} placeholder={`all (1-${pageCount}), or e.g. ${currentPage}`} aria-label="Pages to export" className="w-48 rounded border border-border bg-bg px-2 py-1" />
        </label>
        {busy && <progress value={progress} max={1} aria-label="Progress" className="w-full" />}
        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        <DialogActions>
          {busy ? <Button onClick={() => abort.current?.abort()}>Cancel</Button> : <Button onClick={close}>Close</Button>}
          <Button variant="primary" disabled={busy || marks} onClick={() => void go()}>{busy ? 'Working…' : 'Export'}</Button>
        </DialogActions>
      </div>
    </Modal>
  )
}
