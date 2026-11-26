import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}

/** Native <dialog>: focus trapping, Escape to close and inert background come from the platform. */
export function Modal({ title, onClose, children, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
    return () => d?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label={title}
      className={`m-auto max-h-[90dvh] w-[92vw] ${wide ? 'max-w-4xl' : 'max-w-lg'} overflow-hidden rounded-xl border border-border bg-surface p-0 text-text shadow-xl backdrop:bg-black/40 max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-b-none`}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-surface-2 pointer-coarse:size-10">
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="max-h-[calc(90dvh-3.5rem)] overflow-y-auto pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] px-4 max-sm:max-h-[calc(92dvh-3.5rem)]">{children}</div>
    </dialog>
  )
}
