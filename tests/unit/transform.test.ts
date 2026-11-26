import { describe, expect, it } from 'vitest'
import { createPageTransform, viewportSize } from '../../src/lib/geometry/transform'
import type { Rotation } from '../../src/types'

const pageSize = { width: 600, height: 800 }

describe('page transform', () => {
  it.each([0, 90, 180, 270] as Rotation[])('round-trips points at rotation %i and scale 1.5', (rotation) => {
    const t = createPageTransform({ pageSize, rotation, scale: 1.5 })
    const p = { x: 123.4, y: 456.7 }
    const back = t.toPage(t.toViewport(p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })

  it('maps the page top-left corner to the right viewport corner per rotation', () => {
    const corner = (rotation: Rotation) => createPageTransform({ pageSize, rotation, scale: 1 }).toViewport({ x: 0, y: 0 })
    expect(corner(0)).toEqual({ x: 0, y: 0 })
    expect(corner(90)).toEqual({ x: 800, y: 0 })
    expect(corner(180)).toEqual({ x: 600, y: 800 })
    expect(corner(270)).toEqual({ x: 0, y: 600 })
  })

  it('keeps rects normalized and swaps size when rotated', () => {
    const t = createPageTransform({ pageSize, rotation: 90, scale: 2 })
    expect(t.rectToViewport({ x: 10, y: 20, width: 30, height: 40 })).toEqual({ x: 1480, y: 20, width: 80, height: 60 })
    expect(viewportSize({ pageSize, rotation: 90, scale: 2 })).toEqual({ width: 1600, height: 1200 })
  })
})
