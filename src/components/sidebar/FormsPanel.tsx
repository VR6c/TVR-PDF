import { useEffect, useState } from 'react'
import { listFormFieldsInWorker, fillFormInWorker } from '../../lib/formActions'
import type { FormFieldInfo } from '../../lib/pdf/forms'
import { useDocument } from '../../stores/document'
import { inputClass } from '../common/Button'

export function FormsPanel() {
  const bytes = useDocument((s) => s.baseBytes)
  const encrypted = useDocument((s) => s.encrypted)
  const [fields, setFields] = useState<FormFieldInfo[] | null>(null)
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!bytes || encrypted) return
    let alive = true
    listFormFieldsInWorker(bytes).then((r) => {
      if (!alive) return
      setValues({})
      setFields(r.ok ? r.value : [])
    })
    return () => { alive = false }
  }, [bytes, encrypted])

  if (encrypted) return <p className="p-3 text-muted">Form filling isn't supported for encrypted PDFs.</p>
  if (!fields) return <p className="p-3 text-muted">Checking for form fields…</p>
  if (!fields.length) return <p className="p-3 text-muted">This document has no fillable form fields. (This app fills existing forms; it does not create new fields.)</p>

  const dirty = Object.keys(values).length > 0
  return (
    <form
      className="flex flex-col gap-3 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        const r = await fillFormInWorker(values)
        setMsg(r.ok ? 'Form values applied.' : r.error.message)
      }}
    >
      {fields.map((f) => {
        const v = values[f.name]
        return (
          <label key={f.name} className="flex flex-col gap-1 text-xs text-muted">
            <span className="break-words">{f.name}</span>
            {f.kind === 'text' && <input disabled={f.readOnly} value={String(v ?? f.value)} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={`${inputClass} text-sm text-text`} />}
            {f.kind === 'checkbox' && <input type="checkbox" disabled={f.readOnly} checked={Boolean(v ?? f.value)} onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })} className="size-4" />}
            {(f.kind === 'dropdown' || f.kind === 'radio') && (
              <select disabled={f.readOnly} value={String(v ?? f.value)} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} className={`${inputClass} text-sm text-text`}>
                <option value="">—</option>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            )}
          </label>
        )
      })}
      <button type="submit" disabled={!dirty} className="rounded-md bg-accent px-3 py-1.5 text-accent-text disabled:opacity-50">Apply values</button>
      {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
    </form>
  )
}
