import { useEffect, useRef } from 'react'
import { useOpener } from '../../stores/opener'
import { Button, DialogActions } from './Button'

export function CombineDialog() {
  const pending = useOpener((s) => s.pendingCombine)
  const confirm = useOpener((s) => s.confirmCombine)
  const openFirst = useOpener((s) => s.openFirstOnly)
  const cancel = useOpener((s) => s.cancelCombine)
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (pending && !d.open) d.showModal()
    if (!pending && d.open) d.close()
  }, [pending])

  return (
    <dialog
      ref={ref}
      onCancel={cancel}
      className="m-auto w-[92vw] max-w-sm rounded-xl border border-border bg-surface p-5 text-text shadow-xl backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Combine {pending?.length} PDFs?</h2>
        <ol className="max-h-40 list-decimal overflow-auto pl-5 text-muted">
          {pending?.map((f, i) => (
            <li key={i} className="truncate">{f.name}</li>
          ))}
        </ol>
        <DialogActions>
          <Button onClick={cancel}>Cancel</Button>
          <Button onClick={() => void openFirst()}>Open first only</Button>
          <Button variant="primary" autoFocus onClick={() => void confirm()}>Combine</Button>
        </DialogActions>
      </div>
    </dialog>
  )
}
