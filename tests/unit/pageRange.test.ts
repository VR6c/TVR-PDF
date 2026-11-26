import { describe, expect, it } from 'vitest'
import { parsePageRange } from '../../src/lib/pdf/pageRange'

describe('parsePageRange', () => {
  it('parses ranges and singles into sorted unique 0-based indexes', () => {
    expect(parsePageRange('1-3, 5, 8-10, 2', 10)).toEqual({ ok: true, value: [0, 1, 2, 4, 7, 8, 9] })
  })
  it.each(['', '0', '1-', '3-1', 'a', '1,,2', '11', '1-11'])('rejects %j', (input) => {
    const r = parsePageRange(input, 10)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('INVALID_PAGE_RANGE')
  })
})
