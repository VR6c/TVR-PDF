import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { inputClass } from './Button'

export interface SelectOption {
  value: string
  label?: string
  disabled?: boolean
}

interface Props {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  'aria-label'?: string
  disabled?: boolean
  className?: string
}

const MAX_LIST = 256

/** Themed replacement for <select>, built to the APG select-only combobox pattern. */
export function Select({ value, options, onChange, disabled, className = '', 'aria-label': ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<CSSProperties>()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const id = useId()

  const labelOf = (o: SelectOption) => o.label ?? o.value
  const selected = options.findIndex((o) => o.value === value)

  const openList = () => {
    setActive(Math.max(selected, 0))
    setOpen(true)
  }
  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) trigger.current?.focus()
  }
  const choose = (i: number) => {
    const o = options[i]
    if (!o || o.disabled) return
    if (o.value !== value) onChange(o.value)
    close()
  }
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i
    return from
  }

  // Fixed positioning escapes the dialog's overflow clipping; flip above when there is no room below.
  useLayoutEffect(() => {
    if (!open || !trigger.current) return
    const r = trigger.current.getBoundingClientRect()
    const below = window.innerHeight - r.bottom - 8
    const above = r.top - 8
    const up = below < 160 && above > below
    setPos({
      left: r.left,
      minWidth: r.width,
      maxWidth: window.innerWidth - r.left - 8,
      maxHeight: Math.min(MAX_LIST, up ? above : below),
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close(false)
    const dismiss = (e: Event) => !list.current?.contains(e.target as Node) && close(false)
    document.addEventListener('pointerdown', away)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [open])

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return
    const k = e.key
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(k)) { e.preventDefault(); openList() }
      return
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (k === 'Tab') close(false)
    else if (k === 'ArrowDown') { e.preventDefault(); setActive(step(active, 1)) }
    else if (k === 'ArrowUp') { e.preventDefault(); setActive(step(active, -1)) }
    else if (k === 'Home') { e.preventDefault(); setActive(step(-1, 1)) }
    else if (k === 'End') { e.preventDefault(); setActive(step(options.length, -1)) }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); choose(active) }
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Type-ahead: successive keystrokes within a second extend the prefix.
      const now = Date.now()
      const t = typed.current
      t.text = now - t.at > 1000 ? k.toLowerCase() : t.text + k.toLowerCase()
      t.at = now
      const hit = options.findIndex((o) => !o.disabled && labelOf(o).toLowerCase().startsWith(t.text))
      if (hit >= 0) setActive(hit)
    }
  }

  return (
    <div ref={root} className="relative inline-block" onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        className={`${inputClass} flex w-full items-center justify-between gap-2 text-left text-text disabled:opacity-50 pointer-coarse:py-2 ${className}`}
      >
        <span className="truncate">{selected >= 0 ? labelOf(options[selected]) : ''}</span>
        <ChevronDown size={14} aria-hidden className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={ariaLabel}
          style={pos}
          className="fixed z-50 overflow-y-auto rounded-lg border border-border bg-surface py-1 text-text shadow-lg"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              aria-disabled={o.disabled || undefined}
              onPointerEnter={() => !o.disabled && setActive(i)}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 pointer-coarse:py-2.5 ${i === active ? 'bg-surface-2' : ''} ${o.disabled ? 'cursor-default opacity-40' : ''}`}
            >
              <span className="flex-1 whitespace-nowrap">{labelOf(o)}</span>
              {i === selected && <Check size={14} aria-hidden className="shrink-0 text-accent" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
