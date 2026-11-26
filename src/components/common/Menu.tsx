import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
  /** Shown only below the `sm` breakpoint, for actions whose toolbar button is hidden there. */
  compactOnly?: boolean
}

export function Menu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const enabled = () => [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])].filter((el) => el.offsetParent !== null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', away)
    enabled()[0]?.focus()
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  // APG menu button: arrows/Home/End move focus, Escape and Tab close.
  const onKeyDown = (e: KeyboardEvent) => {
    const list = enabled()
    const i = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus() }
  }

  return (
    <div ref={root} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex size-8 items-center justify-center rounded-md pointer-coarse:size-10 hover:bg-surface-2 ${open ? 'bg-surface-2' : ''}`}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {open && (
        <ul role="menu" aria-label={label} className="absolute right-0 z-30 mt-1 max-h-[calc(100dvh-4rem)] w-60 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
          {items.map((it) => (
            <li key={it.label} role="none" className={it.compactOnly ? 'sm:hidden' : ''}>
              <button
                role="menuitem"
                type="button"
                tabIndex={-1}
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent pointer-coarse:py-3"
              >
                <span className="text-muted" aria-hidden>{it.icon}</span>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
