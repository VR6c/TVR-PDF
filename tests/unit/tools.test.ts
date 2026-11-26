import { describe, expect, it } from 'vitest'
import { diffLines, pixelDiff } from '../../src/lib/compare'
import { crc32, makeZip } from '../../src/lib/zip'

describe('diffLines', () => {
  it('reports only the changed lines', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual({ removed: ['b'], added: ['x'] })
    expect(diffLines(['a'], ['a'])).toEqual({ removed: [], added: [] })
    expect(diffLines([], ['n'])).toEqual({ removed: [], added: ['n'] })
  })
  it('copes with moved and repeated lines', () => {
    const d = diffLines(['1', '2', '3', '2'], ['2', '3', '2', '4'])
    expect(d.removed).toEqual(['1'])
    expect(d.added).toEqual(['4'])
  })
  it('falls back to a set comparison for very long pages', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `l${i}`)
    expect(diffLines(a, [...a.slice(1), 'new'])).toEqual({ removed: ['l0'], added: ['new'] })
  })
})

describe('pixelDiff', () => {
  const px = (...v: number[]) => new Uint8ClampedArray(v.flatMap((x) => [x, x, x, 255]))
  it('measures the share of changed pixels', () => {
    expect(pixelDiff(px(255, 255, 0, 0), px(255, 255, 0, 255))).toBe(0.25)
    expect(pixelDiff(px(10, 20), px(12, 18))).toBe(0) // tiny anti-aliasing noise is ignored
  })
  it('paints changed pixels red in the output', () => {
    const out = new Uint8ClampedArray(8)
    pixelDiff(px(255, 0), px(0, 0), out)
    expect(Array.from(out.slice(0, 3))).toEqual([220, 38, 38])
  })
})

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
  it('lays out a readable archive with the right entry count', () => {
    const z = makeZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'b.txt', data: new Uint8Array([1, 2, 3]) }])
    const v = new DataView(z.buffer)
    expect(v.getUint32(0, true)).toBe(0x04034b50)
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(2)
  })
})
