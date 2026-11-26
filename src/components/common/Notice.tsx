import type { ReactNode } from 'react'

export type NoticeKind = 'error' | 'ok'

const BANNER: Record<NoticeKind, string> = {
  error: 'rounded border border-red-300 bg-red-50 p-2 text-red-800',
  ok: 'rounded border border-green-500 bg-surface-2 p-2 font-medium text-text',
}

interface Props {
  kind: NoticeKind
  /** Render as bare coloured text instead of a bordered banner. */
  plain?: boolean
  children: ReactNode
}

/** Inline feedback message; errors are announced assertively, successes politely. */
export function Notice({ kind, plain, children }: Props) {
  const cls = plain ? (kind === 'error' ? 'text-red-600' : 'text-green-700') : BANNER[kind]
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={cls}>
      {kind === 'ok' && !plain && '✓ '}
      {children}
    </p>
  )
}
