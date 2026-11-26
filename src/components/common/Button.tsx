import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent px-4 font-medium text-accent-text disabled:opacity-50',
  ghost: 'px-3 hover:bg-surface-2',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

/** Dialog-level button. Defaults to `type="button"`; pass `type="submit"` for form submits. */
export function Button({ variant = 'ghost', type = 'button', className = '', ...rest }: Props) {
  return <button type={type} className={`rounded-md py-1.5 ${VARIANTS[variant]} ${className}`} {...rest} />
}

/** Right-aligned footer row shared by every dialog. */
export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>
}

/** Text input / select styling shared by dialog forms. */
export const inputClass = 'rounded border border-border bg-bg px-2 py-1'
