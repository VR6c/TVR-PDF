const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/**
 * Estimates the background and text colors of a region of a rendered page. Background = most common
 * (quantised) pixel; text = the pixel furthest from it. Falls back to white on black if the canvas can't be read.
 */
export function sampleColors(canvas: HTMLCanvasElement, rect: { x: number; y: number; width: number; height: number }, dpr: number) {
  const fallback = { background: '#ffffff', text: '#000000' }
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback
  const x = Math.max(0, Math.floor(rect.x * dpr))
  const y = Math.max(0, Math.floor(rect.y * dpr))
  const w = Math.min(canvas.width - x, Math.ceil(rect.width * dpr))
  const h = Math.min(canvas.height - y, Math.ceil(rect.height * dpr))
  if (w < 1 || h < 1) return fallback
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(x, y, w, h).data
  } catch {
    return fallback
  }
  const counts = new Map<number, number>()
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let bgKey = 0
  let best = -1
  for (const [k, n] of counts) {
    if (n > best) {
      best = n
      bgKey = k
    }
  }
  const bg = [((bgKey >> 10) & 31) << 3, ((bgKey >> 5) & 31) << 3, (bgKey & 31) << 3]
  // Quantising dropped the low bits; use the first real pixel that falls in the winning bucket for an exact color.
  for (let i = 0; i < data.length; i += 4) {
    if (((data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | (data[i + 2] >> 3)) === bgKey) {
      bg[0] = data[i]; bg[1] = data[i + 1]; bg[2] = data[i + 2]
      break
    }
  }
  let far = 0
  let fg = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2])
    if (d > far) {
      far = d
      fg = [data[i], data[i + 1], data[i + 2]]
    }
  }
  // Almost no contrast means there was no real text pixel (e.g. blank run): pick a readable default.
  if (far < 60) fg = bg[0] + bg[1] + bg[2] > 382 ? [0, 0, 0] : [255, 255, 255]
  return { background: toHex(bg[0], bg[1], bg[2]), text: toHex(fg[0], fg[1], fg[2]) }
}
