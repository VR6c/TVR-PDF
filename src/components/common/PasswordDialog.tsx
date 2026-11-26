import { useEffect, useRef, useState } from 'react'
import { useOpener } from '../../stores/opener'

export function PasswordDialog() {
  const pending = useOpener((s) => s.pendingPassword)
  const submit = useOpener((s) => s.submitPassword)
  const cancel = useOpener((s) => s.cancelPassword)
  const [value, setValue] = useState('')
  const ref = useRef<HTMLDialogElement>(null)

  // Clear the field whenever a new prompt (including a wrong-password retry) appears.
  const [seen, setSeen] = useState(pending)
  if (pending !== seen) {
    setSeen(pending)
    if (pending) setValue('')
  }

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
      className="m-auto w-[92vw] max-w-xs rounded-xl border border-border bg-surface p-5 text-text shadow-xl backdrop:bg-black/40"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit(value)
        }}
        className="flex flex-col gap-3"
      >
        <h2 className="text-base font-semibold">Password required</h2>
        <p className="truncate text-muted">{pending?.name}</p>
        <input
          type="password"
          autoFocus
          autoComplete="off"
          aria-label="PDF password"
          aria-invalid={pending?.wrong}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-md border border-border bg-bg px-3 py-2"
        />
        {pending?.wrong && <p role="alert" className="text-red-600">Incorrect password. Try again.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={cancel} className="rounded-md px-3 py-1.5 hover:bg-surface-2">
            Cancel
          </button>
          <button type="submit" disabled={!value} className="rounded-md bg-accent px-3 py-1.5 text-accent-text disabled:opacity-50">
            Open
          </button>
        </div>
      </form>
    </dialog>
  )
}
