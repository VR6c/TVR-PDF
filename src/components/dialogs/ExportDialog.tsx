import { useRef, useState } from 'react'
import { fmt, printBytes, runExport, saveBytes } from '../../lib/exportActions'
import { useDocument } from '../../stores/document'
import { useExtras } from '../../stores/extras'
import { useOcr } from '../../stores/ocr'
import { callWorker } from '../../lib/pdf/workerClient'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { Modal } from '../common/Modal'

export function ExportDialog({ mode }: { mode: 'export' | 'print' }) {
  const close = useUI((s) => s.close)
  const fileName = useViewer((s) => s.fileName)
  const encrypted = useDocument((s) => s.encrypted)
  const marks = useDocument((s) => s.annotations.filter((a) => a.type === 'redaction').length)
  const ocrPages = useOcr((s) => s.words.size)
  const [compress, setCompress] = useState(false)
  const [maxDim, setMaxDim] = useState(1600)
  const [quality, setQuality] = useState(0.7)
  const [strip, setStrip] = useState(true)
  const [includeOcr, setIncludeOcr] = useState(true)
  const decorations = useExtras((s) => s.decorations)
  const setDecorations = useExtras((s) => s.setDecorations)
  const [protect, setProtect] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [sizes, setSizes] = useState<{ before: number; after: number } | null>(null)
  const abort = useRef<AbortController | null>(null)
  const isPrint = mode === 'print'

  const go = async () => {
    setBusy(true)
    setMessage(null)
    setProgress(0)
    abort.current = new AbortController()
    const r = await runExport({ compress, maxImageDimension: maxDim, imageQuality: quality, stripMetadata: strip, includeOcr, signal: abort.current.signal, onProgress: setProgress })
    setBusy(false)
    if (!r.ok) return r.error.code !== 'CANCELLED' ? setMessage({ kind: 'error', text: r.error.message }) : undefined
    let bytes = r.value.bytes
    if (protect && !isPrint) {
      const enc = await callWorker<Uint8Array>('encrypt', { bytes, password: pw })
      if (!enc.ok) return setMessage({ kind: 'error', text: enc.error.message })
      bytes = enc.value.buffer.slice(enc.value.byteOffset, enc.value.byteOffset + enc.value.byteLength) as ArrayBuffer
    }
    setSizes({ before: r.value.originalSize, after: bytes.byteLength })
    if (isPrint) {
      printBytes(bytes)
      setMessage({ kind: 'ok', text: 'Sent to the print dialog.' })
      return
    }
    const name = `${fileName.replace(/\.pdf$/i, '')}-edited.pdf`
    const how = await saveBytes(bytes, name)
    if (how !== 'cancelled') setMessage({ kind: 'ok', text: how === 'saved' ? 'Saved to disk.' : 'Downloaded to your Downloads folder.' })
  }

  const blocked = encrypted
    ? 'This PDF is encrypted. Choose “Unlock for editing” from the ⋯ menu (you will need its password) to edit pages and export.'
    : marks
      ? `You have ${marks} unapplied redaction mark${marks === 1 ? '' : 's'}. Apply them (Properties panel) or delete them first: a mark is not redaction.`
      : null

  return (
    <Modal title={isPrint ? 'Print' : 'Export PDF'} onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-muted">Annotations, signatures, page changes and form values are written into standard PDF content, so the file opens in any PDF viewer. Everything happens on this device.</p>
        {ocrPages > 0 && (
          <label className="flex items-center gap-2"><input type="checkbox" checked={includeOcr} onChange={(e) => setIncludeOcr(e.target.checked)} /> Add searchable text layer from OCR ({ocrPages} page{ocrPages === 1 ? '' : 's'})</label>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} /> Compress images (lossy)</label>
        {compress && (
          <div className="ml-6 flex flex-col gap-2 text-sm">
            <label className="flex items-center justify-between gap-2">Largest image edge
              <select value={maxDim} onChange={(e) => setMaxDim(Number(e.target.value))} className="rounded border border-border bg-bg px-2 py-1">
                {[1000, 1600, 2400].map((n) => <option key={n} value={n}>{n}px</option>)}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2">JPEG quality {Math.round(quality * 100)}%
              <input type="range" min={0.4} max={0.95} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} /> Remove document metadata</label>
            <p className="text-xs text-muted">Only embedded JPEG images are downsampled; other images are left as they are. Compression is lossy and may not reduce every file.</p>
          </div>
        )}
        <fieldset className="flex flex-col gap-2 rounded border border-border p-2 text-sm">
          <legend className="px-1 text-muted">Page extras (applied to every page)</legend>
          <label className="flex items-center justify-between gap-2">Watermark
            <input aria-label="Watermark text" placeholder="e.g. CONFIDENTIAL" value={decorations.watermark?.text ?? ''} onChange={(e) => setDecorations({ ...decorations, watermark: { text: e.target.value, opacity: decorations.watermark?.opacity ?? 0.2 } })} className="w-48 rounded border border-border bg-bg px-2 py-1" />
          </label>
          {!!decorations.watermark?.text && (
            <label className="flex items-center justify-between gap-2">Watermark strength {Math.round((decorations.watermark.opacity) * 100)}%
              <input type="range" min={0.05} max={0.6} step={0.05} value={decorations.watermark.opacity} onChange={(e) => setDecorations({ ...decorations, watermark: { text: decorations.watermark!.text, opacity: Number(e.target.value) } })} />
            </label>
          )}
          <label className="flex items-center justify-between gap-2">Header
            <input aria-label="Header text" placeholder="Use {n} and {total}" value={decorations.header ?? ''} onChange={(e) => setDecorations({ ...decorations, header: e.target.value })} className="w-48 rounded border border-border bg-bg px-2 py-1" />
          </label>
          <label className="flex items-center justify-between gap-2">Footer
            <input aria-label="Footer text" placeholder="Use {n} and {total}" value={decorations.footer ?? ''} onChange={(e) => setDecorations({ ...decorations, footer: e.target.value })} className="w-48 rounded border border-border bg-bg px-2 py-1" />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!decorations.pageNumbers} onChange={(e) => setDecorations({ ...decorations, pageNumbers: e.target.checked ? { format: 'Page {n} of {total}', position: 'center' } : undefined })} /> Page numbers</label>
          {decorations.pageNumbers && (
            <div className="ml-6 flex gap-2">
              <input aria-label="Page number format" value={decorations.pageNumbers.format} onChange={(e) => setDecorations({ ...decorations, pageNumbers: { ...decorations.pageNumbers!, format: e.target.value } })} className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1" />
              <select aria-label="Page number position" value={decorations.pageNumbers.position} onChange={(e) => setDecorations({ ...decorations, pageNumbers: { ...decorations.pageNumbers!, position: e.target.value as 'left' | 'center' | 'right' } })} className="rounded border border-border bg-bg px-2 py-1">
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </div>
          )}
        </fieldset>
        {!isPrint && (
          <>
            <label className="flex items-center gap-2"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} /> Protect with a password (AES-256)</label>
            {protect && (
              <div className="ml-6 flex flex-col gap-2 text-sm">
                <input type="password" autoComplete="new-password" aria-label="New password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} className="rounded border border-border bg-bg px-2 py-1" />
                <input type="password" autoComplete="new-password" aria-label="Confirm password" placeholder="Confirm password" value={pw2} onChange={(e) => setPw2(e.target.value)} className="rounded border border-border bg-bg px-2 py-1" />
                <p className="text-xs text-muted">The same password is needed to open the file. If you forget it, it cannot be recovered.</p>
              </div>
            )}
          </>
        )}
        {blocked && <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-red-800">{blocked}</p>}
        {busy && <progress value={progress} max={1} aria-label="Export progress" className="w-full" />}
        {message && <p role="status" className={`rounded border p-2 font-medium ${message.kind === 'error' ? 'border-red-400 text-red-500' : 'border-green-500 bg-surface-2 text-text'}`}>{message.kind === 'ok' ? '✓ ' : ''}{message.text}</p>}
        {sizes && <p className="text-muted">Original {fmt(sizes.before)} → exported {fmt(sizes.after)}</p>}
        <div className="flex justify-end gap-2">
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Cancel</button>
          ) : (
            <button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Close</button>
          )}
          <button type="button" disabled={busy || !!blocked || (protect && !isPrint && (pw.length < 4 || pw !== pw2))} onClick={() => void go()} className="rounded-md bg-accent px-4 py-1.5 font-medium text-accent-text disabled:opacity-50">
            {busy ? 'Working…' : isPrint ? 'Print' : 'Export'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
