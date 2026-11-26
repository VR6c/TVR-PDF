import { useCallback, useEffect, useState } from 'react'
import { closeDocument } from '../../lib/session'
import { documentRepo, storageManager } from '../../lib/storage/repositories'
import { useSignatures } from '../../stores/signatures'
import { useUI } from '../../stores/ui'
import { useDocument } from '../../stores/document'
import type { DocumentSummary } from '../../types'
import { Modal } from '../common/Modal'
import { useTabs } from '../../lib/session'

const fmt = (n: number) => (n > 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`)

export function StorageDialog() {
  const close = useUI((s) => s.close)
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [est, setEst] = useState<{ usage: number; quota: number } | null | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const activeId = useDocument((s) => s.docId)

  const refresh = useCallback(async () => {
    setDocs([...(await documentRepo.listRecent(200))])
    setEst(await storageManager.estimate())
  }, [])
  useEffect(() => {
    let alive = true
    void documentRepo.listRecent(200).then((d) => alive && setDocs([...d]))
    void storageManager.estimate().then((e) => alive && setEst(e))
    return () => { alive = false }
  }, [])

  const wipe = async () => {
    await closeDocument()
    await storageManager.clearAll()
    try { localStorage.clear() } catch { /* nothing stored or blocked */ }
    useTabs.getState().set([])
    await useSignatures.getState().load()
    setConfirming(false)
    setMessage('All local data was deleted.')
    await refresh()
  }

  return (
    <Modal title="Storage and privacy" onClose={close}>
      <div className="flex flex-col gap-3">
        <p className="text-muted">Documents, drafts, annotations and signatures are stored only in this browser. Nothing is uploaded.</p>
        {est === null ? <p className="text-muted">This browser cannot report storage usage.</p> : est && (
          <div>
            <progress value={est.usage} max={est.quota || 1} aria-label="Storage used" className="w-full" />
            <p className="text-xs text-muted">{fmt(est.usage)} used of roughly {fmt(est.quota)} available (the browser's estimate)</p>
          </div>
        )}
        <h3 className="text-sm font-medium">Stored documents</h3>
        {docs.length === 0 ? <p className="text-muted">No documents stored.</p> : (
          <ul className="divide-y divide-border rounded border border-border">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0"><span className="block truncate">{d.fileName}</span><span className="text-xs text-muted">{fmt(d.fileSize)} · {d.pageCount} pages</span></span>
                <button type="button" onClick={async () => { if (d.id === activeId) await closeDocument(); await documentRepo.remove(d.id); useTabs.getState().set(useTabs.getState().tabs.filter((t) => t.id !== d.id)); await refresh() }} className="rounded px-2 py-1 text-red-600 hover:bg-surface-2">Delete</button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border pt-3">
          {confirming ? (
            <div role="alertdialog" className="flex flex-col gap-2 rounded border border-red-300 bg-red-50 p-3 text-red-900">
              <p>Delete every stored document, draft, annotation and signature, plus settings? This cannot be undone.</p>
              <div className="flex gap-2"><button type="button" onClick={() => void wipe()} className="rounded bg-red-600 px-3 py-1.5 text-white">Yes, delete everything</button><button type="button" onClick={() => setConfirming(false)} className="rounded px-3 py-1.5 hover:bg-red-100">Keep my data</button></div>
            </div>
          ) : <button type="button" onClick={() => setConfirming(true)} className="rounded-md border border-red-400 px-3 py-1.5 text-red-600 hover:bg-surface-2">Clear all local data…</button>}
          {message && <p role="status" className="mt-2 text-green-700">{message}</p>}
        </div>
      </div>
    </Modal>
  )
}
