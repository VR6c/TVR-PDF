/** Draws text to a bitmap with the browser's own shaping, so Khmer and other complex scripts export correctly. */
export interface TextRasterizer {
  /** Width in PDF points. */
  measure(text: string, size: number, family: string): number
  render(text: string, size: number, family: string, color: string): Promise<{ bytes: Uint8Array; width: number; height: number } | null>
}

const SCALE = 3
const stack = (family: string) => `${/mono|courier/i.test(family) ? '"Courier New"' : /times|serif/i.test(family) && !/sans/i.test(family) ? '"Times New Roman"' : 'Helvetica, Arial'}, "Noto Sans Khmer", "Khmer OS", "Leelawadee UI", "Khmer Sangam MN", sans-serif`

export const browserTextRasterizer: TextRasterizer = {
  measure(text, size, family) {
    const ctx = new OffscreenCanvas(1, 1).getContext('2d')!
    ctx.font = `${size}px ${stack(family)}`
    return ctx.measureText(text).width
  },
  async render(text, size, family, color) {
    const probe = new OffscreenCanvas(1, 1).getContext('2d')!
    probe.font = `${size * SCALE}px ${stack(family)}`
    const w = Math.max(1, Math.ceil(probe.measureText(text).width) + 2)
    const h = Math.ceil(size * SCALE * 1.5)
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')!
    ctx.font = `${size * SCALE}px ${stack(family)}`
    ctx.fillStyle = color
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(text, 1, size * SCALE * 1.05)
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w / SCALE, height: h / SCALE }
  },
}
