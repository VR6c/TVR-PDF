import { useState } from 'react'
import { callWorker } from '../../lib/pdf/workerClient'
import { useDocument } from '../../stores/document'
import { useNotice } from '../../stores/notice'
import { useUI } from '../../stores/ui'
import { Modal } from '../common/Modal'

/** Makes an editable, unencrypted working copy of a password-protected PDF (the original file on disk is untouched). */
export function UnlockDialog() {
  const close = useUI((s) => s.close)
  const encrypted = useDocument((s) => s.encrypted)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    const bytes = useDocument.getState().baseBytes
    if (!bytes) return
    setBusy(true)
    setError(null)
    const r = await callWorker<Uint8Array>('decrypt', { bytes, password })
    setBusy(false)
    if (!r.ok) return setError(r.error.code === 'PASSWORD_INCORRECT' ? 'That password is not correct.' : r.error.message)
    const out = r.value.buffer.slice(r.value.byteOffset, r.value.byteOffset + r.value.byteLength) as ArrayBuffer
    useDocument.getState().unlock(out)
    useNotice.getState().show('info', 'Unlocked. Page editing, forms and export now work. Use “Protect with password” when exporting to keep it protected.')
    close()
  }

  return (
    <Modal title="Unlock for editing" onClose={close}>
      <form onSubmit={(e) => { e.preventDefault(); void go() }} className="flex flex-col gap-3">
        {!encrypted && <p>This document is not encrypted.</p>}
        <p className="text-muted">Creates an unencrypted working copy so you can edit pages, fill forms and export. <strong>The copy autosaved on this device will no longer be password-protected</strong>; your original file is not changed. Export with a password to protect the result.</p>
        <input type="password" autoFocus autoComplete="off" aria-label="Document password" placeholder="Document password" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded border border-border bg-bg px-2 py-1.5" />
        {error && <p role="alert" className="text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-md px-3 py-1.5 hover:bg-surface-2">Cancel</button>
          <button type="submit" disabled={busy || !encrypted || !password} className="rounded-md bg-accent px-4 py-1.5 font-medium text-accent-text disabled:opacity-50">{busy ? 'Unlocking…' : 'Unlock'}</button>
        </div>
      </form>
    </Modal>
  )
}
