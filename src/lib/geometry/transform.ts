import type { PagePoint, PageRect, PageTransform, PageViewport } from '../../types'

/**
 * Maps between page space (unrotated, top-left origin, PDF units) and viewport
 * space (CSS px, after rotation and zoom). Rotation is clockwise.
 */
export function createPageTransform({ pageSize, rotation, scale }: PageViewport): PageTransform {
  const { width: W, height: H } = pageSize

  const toViewport = ({ x, y }: PagePoint): PagePoint => {
    switch (rotation) {
      case 0: return { x: x * scale, y: y * scale }
      case 90: return { x: (H - y) * scale, y: x * scale }
      case 180: return { x: (W - x) * scale, y: (H - y) * scale }
      case 270: return { x: y * scale, y: (W - x) * scale }
    }
  }

  const toPage = ({ x: vx, y: vy }: PagePoint): PagePoint => {
    const x = vx / scale
    const y = vy / scale
    switch (rotation) {
      case 0: return { x, y }
      case 90: return { x: y, y: H - x }
      case 180: return { x: W - x, y: H - y }
      case 270: return { x: W - y, y: x }
    }
  }

  const mapRect = (r: PageRect, f: (p: PagePoint) => PagePoint): PageRect => {
    const a = f({ x: r.x, y: r.y })
    const b = f({ x: r.x + r.width, y: r.y + r.height })
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
  }

  return {
    toViewport,
    toPage,
    rectToViewport: (r) => mapRect(r, toViewport),
    rectToPage: (r) => mapRect(r, toPage),
  }
}

/**
 * Konva Group props that apply the page→viewport mapping, so children can use
 * page-space coordinates directly (and stroke widths scale with zoom).
 */
export function konvaGroupProps({ pageSize, rotation, scale }: PageViewport) {
  const { width: W, height: H } = pageSize
  const origin = { 0: [0, 0], 90: [H * scale, 0], 180: [W * scale, H * scale], 270: [0, W * scale] }[rotation]
  return { x: origin[0], y: origin[1], rotation, scaleX: scale, scaleY: scale }
}

/** Viewport size of a page after rotation and zoom. */
export function viewportSize({ pageSize, rotation, scale }: PageViewport) {
  const swap = rotation === 90 || rotation === 270
  return { width: (swap ? pageSize.height : pageSize.width) * scale, height: (swap ? pageSize.width : pageSize.height) * scale }
}
