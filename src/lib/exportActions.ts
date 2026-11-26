import { useDocument } from '../stores/document'
import { useExtras } from '../stores/extras'
import { useOcr } from '../stores/ocr'
import { useSignatures } from '../stores/signatures'
import type { ExportResult, SignatureId } from '../types'
import { downloadBlob } from './download'
import { callWorker } from './pdf/workerClient'

export const fmt = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`)

/** Runs the export in the worker; the caller decides what to do with the bytes. */
export async function runExport(opts: { compress: boolean; maxImageDimension: number; imageQuality: number; stripMetadata: boolean; includeOcr: boolean; signal?: AbortSignal; onProgress?: (f: number) => void }) {
  const doc = useDocument.getState()
  if (!doc.baseBytes) return { ok: false as const, error: { code: 'INTERNAL' as const, message: 'No document is open.' } }
  const sigs = new Map<SignatureId, { mime: 'image/png' | 'image/jpeg'; bytes: ArrayBuffer }>()
  for (const a of doc.annotations) {
    if (a.type !== 'signature' || sigs.has(a.signatureId)) continue
    const s = useSignatures.getState().byId(a.signatureId)
    if (!s) {
      return { ok: false as const, error: { code: 'INVALID_ANNOTATION_DATA' as const, message: 'A signature placed in this document is no longer in your signature vault. Delete that signature from the page (or re-create it) and export again.' } }
    }
    sigs.set(a.signatureId, { mime: s.mime, bytes: s.imageData })
  }
  const extras = useExtras.getState()
  const d = extras.decorations
  const hasDecor = !!(d.watermark?.text.trim() || d.header?.trim() || d.footer?.trim() || d.pageNumbers)
  const req = {
    source: doc.baseBytes,
    pages: doc.pages,
    annotations: doc.annotations,
    signatures: sigs,
    ...(hasDecor ? { decorations: d } : {}),
    ...(Object.keys(extras.metadata).length ? { metadata: extras.metadata } : {}),
    ...(extras.bookmarks.length ? { bookmarks: extras.bookmarks } : {}),
    ...(opts.includeOcr && useOcr.getState().words.size ? { ocrLayer: useOcr.getState().words } : {}),
    ...(opts.compress ? { compression: { maxImageDimension: opts.maxImageDimension, imageQuality: opts.imageQuality, stripMetadata: opts.stripMetadata } } : {}),
  }
  return callWorker<ExportResult>('export', { req, compress: opts.compress }, { signal: opts.signal, onProgress: opts.onProgress })
}

export async function saveBytes(bytes: ArrayBuffer, suggestedName: string): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const w = window as unknown as { showSaveFilePicker?: (o: unknown) => Promise<{ createWritable(): Promise<{ write(b: BufferSource): Promise<void>; close(): Promise<void> }> }> }
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({ suggestedName, types: [{ description: 'PDF document', accept: { 'application/pdf': ['.pdf'] } }] })
      const stream = await handle.createWritable()
      await stream.write(bytes)
      await stream.close()
      return 'saved'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // fall through to the download fallback
    }
  }
  downloadBlob(bytes, suggestedName, 'application/pdf')
  return 'downloaded'
}

export function printBytes(bytes: ArrayBuffer) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      window.open(url, '_blank') // some browsers can't print an iframe PDF: let the viewer's own print do it
    }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 60000)
  }
  document.body.appendChild(frame)
}

