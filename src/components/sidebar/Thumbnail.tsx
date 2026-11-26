import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef } from 'react'
import { useNearViewport } from '../../hooks/useNearViewport'

const THUMB_WIDTH = 120

interface Props {
  doc: PDFDocumentProxy
  pageIndex: number
  rotation: number
  active: boolean
  root: Element | null
  onSelect: () => void
}

export function Thumbnail({ doc, pageIndex, rotation, active, root, onSelect }: Props) {
  const [ref, near] = useNearViewport<HTMLButtonElement>(root, '300px 0px')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!near) {
      canvas.width = 0
      canvas.height = 0
      return
    }
    let cancelled = false
    let task: RenderTask | null = null
    ;(async () => {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      const rot = (page.rotate + rotation) % 360
      const base = page.getViewport({ scale: 1, rotation: rot })
      const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width, rotation: rot })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      task = page.render({ canvas, viewport })
      await task.promise
    })().catch(() => undefined)
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [near, doc, pageIndex, rotation])

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      aria-label={`Go to page ${pageIndex + 1}`}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-24 flex-col items-center gap-1 rounded-md p-2 hover:bg-surface-2 ${active ? 'bg-surface-2 ring-2 ring-accent' : ''}`}
    >
      <canvas ref={canvasRef} className="bg-white shadow" />
      <span className="text-xs text-muted">{pageIndex + 1}</span>
    </button>
  )
}
