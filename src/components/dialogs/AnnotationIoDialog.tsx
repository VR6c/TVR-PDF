import { useState } from 'react'
import { exportAnnotations, importAnnotations } from '../../lib/annotations/io'
import { useDocument } from '../../stores/document'
import { useUI } from '../../stores/ui'
import { Modal } from '../common/Modal'

const MAX_BYTES = 20 * 1024 * 1024

export function AnnotationIoDialog() {
  const close = useUI((s) => s.close)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const doExport = () => {
    const { annotations, pages } = useDocument.getState()
    const json = JSON.stringify(exportAnnotations(annotations, pages), null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'annotations.json'
    a.click()
    URL.revokeObjectURL(url)
    setMsg({ kind: 'ok', text: `Exported ${annotations.length} annotation${annotations.length === 1 ? '' : 's'}.` })
  }

  const doImport = async (f: File | undefined) => {
    if (!f) return
    if (f.size > MAX_BYTES) return setMsg({ kind: 'error', text: 'That file is too large.' })
    let raw: unknown
    try { raw = JSON.parse(await f.text()) } catch { return setMsg({ kind: 'error', text: 'That file is not valid JSON.' }) }
    const { pages, annotations } = useDocument.getState()
    const r = importAnnotations(raw, pages)
    if (!r.ok) return setMsg({ kind: 'error', text: r.error.message })
    useDocument.getState().replaceAnnotations([...annotations, ...r.value])
    setMsg({ kind: 'ok', text: `Imported ${r.value.length} annotation${r.value.length === 1 ? '' : 's'}. Signature annotations need the matching signature in your vault to export.` })
  }

  return (
    <Modal title="Import / export annotations" onClose={close}>
      <div className="flex flex-col gap-4">
        <p className="text-muted">Annotations use a documented JSON format (schemaVersion 1; see docs/annotation-format.md). Imported data is validated before it is applied.</p>
        <button type="button" onClick={doExport} className="self-start rounded-md bg-accent px-3 py-1.5 text-accent-text">Export annotations (.json)</button>
        <label className="flex flex-col gap-1">Import annotations
          <input type="file" accept="application/json,.json" onChange={(e) => void doImport(e.target.files?.[0])} />
        </label>
        {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={`rounded border p-2 font-medium ${msg.kind === 'error' ? 'border-red-400 text-red-500' : 'border-green-500 bg-surface-2 text-text'}`}>{msg.kind === 'ok' ? '✓ ' : ''}{msg.text}</p>}
      </div>
    </Modal>
  )
}
