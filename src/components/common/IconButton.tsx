import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon
  label: string
  active?: boolean
}

/** 32px on pointer devices, 40px on touch; active tools get the accent tint so state is not shown by shade alone. */
export function IconButton({ icon: Icon, label, active, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-text transition-colors pointer-coarse:size-10 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent ${active ? 'bg-accent-soft text-accent' : ''} ${className}`}
      {...rest}
    >
      <Icon size={18} aria-hidden />
    </button>
  )
}
