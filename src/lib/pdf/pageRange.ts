import { err, ok } from '../../types'
import type { ParsePageRange } from '../../types'

/** "1-3, 5, 8-10" → sorted, de-duplicated 0-based indexes. */
export const parsePageRange: ParsePageRange = (input, pageCount) => {
  const bad = (message: string) => err({ code: 'INVALID_PAGE_RANGE' as const, message })
  const parts = input.split(',').map((p) => p.trim())
  if (!input.trim() || parts.some((p) => p === '')) return bad('Enter page numbers like 1-3, 5, 8-10.')
  const out = new Set<number>()
  for (const part of parts) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part)
    if (!m) return bad(`"${part}" is not a valid page or range.`)
    const from = Number(m[1])
    const to = m[2] === undefined ? from : Number(m[2])
    if (from < 1 || to < 1 || from > pageCount || to > pageCount) return bad(`Pages must be between 1 and ${pageCount}.`)
    if (from > to) return bad(`"${part}" is backwards.`)
    for (let i = from; i <= to; i++) out.add(i - 1)
  }
  return ok([...out].sort((a, b) => a - b))
}
