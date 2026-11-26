import type { Annotation, AnnotationPatch } from '../../types'

export interface StyleChange {
  color?: string
  opacity?: number
  strokeWidth?: number
  fontSize?: number
  fontFamily?: string
  align?: 'left' | 'center' | 'right'
}

/** Translates a property-panel change into a patch for whichever fields this annotation type has. Null = not applicable. */
export function stylePatch(a: Annotation, c: StyleChange): AnnotationPatch | null {
  switch (a.type) {
    case 'highlight':
    case 'underline':
    case 'strikethrough': {
      const p: { color?: string; opacity?: number } = {}
      if (c.color !== undefined) p.color = c.color
      if (c.opacity !== undefined) p.opacity = c.opacity
      return Object.keys(p).length ? p : null
    }
    case 'freehand':
    case 'line':
    case 'arrow': {
      const style = { ...a.style, ...(c.color && { color: c.color }), ...(c.opacity !== undefined && { opacity: c.opacity }), ...(c.strokeWidth !== undefined && { width: c.strokeWidth }) }
      return style === a.style ? null : { style }
    }
    case 'rectangle':
    case 'ellipse': {
      const stroke = { ...a.stroke, ...(c.color && { color: c.color }), ...(c.opacity !== undefined && { opacity: c.opacity }), ...(c.strokeWidth !== undefined && { width: c.strokeWidth }) }
      const fill = a.fill && c.color ? { ...a.fill, color: c.color } : a.fill
      return { stroke, fill }
    }
    case 'text':
    case 'textedit': {
      const style = { ...a.style, ...(c.color && { color: c.color }), ...(c.fontSize && { fontSize: c.fontSize }), ...(c.fontFamily && { fontFamily: c.fontFamily }), ...(c.align && { align: c.align }) }
      return { style }
    }
    case 'note':
      return c.color ? { color: c.color } : null
    default:
      return null
  }
}

/** Width of `text` at font size 1 in bold Helvetica (Arial is metric-compatible), for fitting stamp text. */
export function boldTextWidth(text: string): number {
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * 0.7
  ctx.font = 'bold 100px Helvetica, Arial, sans-serif'
  return ctx.measureText(text).width / 100
}

export const stampFontSize = (text: string, width: number, height: number) =>
  Math.min(height * 0.5, (width * 0.85) / boldTextWidth(text))

/** Where a replaced line's text box sits: x at the original left edge, vertically centred on the original line. */
export const textEditOrigin = (b: { x: number; y: number; height: number }, fontSize: number) => ({
  x: b.x,
  y: b.y + b.height / 2 - fontSize * 0.6,
})
