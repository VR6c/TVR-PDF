import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist'
import 'pdfjs-dist/web/pdf_viewer.css'
import { useEffect, useRef, useState } from 'react'
import { useNearViewport } from '../../hooks/useNearViewport'
import type { PageId, PageSize, Rotation } from '../../types'
import { lazy, Suspense } from 'react'
import { loadPdfjs } from '../../lib/pdf/engine'
import { sampleColors } from '../../lib/annotations/sample'
import { createPageTransform } from '../../lib/geometry/transform'
import { useDocument } from '../../stores/document'
import { useNotice } from '../../stores/notice'
import { useTools } from '../../stores/tools'
import { useViewer } from '../../stores/viewer'

const AnnotationLayer = lazy(() => import('../annotations/AnnotationLayer').then((m) => ({ default: m.AnnotationLayer })))

interface Props {
  doc: PDFDocumentProxy
  pageIndex: number
  pageId: PageId | undefined
  /** Unrotated size in PDF points. */
  pageSize: PageSize
  scale: number
  /** Viewer rotation added to the page's own /Rotate. */
  rotation: number
  /** Total effective rotation. */
  totalRotation: Rotation
  width: number
  height: number
  root: Element | null
}

/**
 * One page. Placeholder sizing keeps scroll geometry stable; the canvas and text
 * layer exist only while the page is within ~2 viewports, then are released.
 */
/** pdf.js sets the span's font-size as `calc(var(--total-scale-factor) * Npx)`; N is the size in PDF units. */
function spanFont(span: HTMLElement, fallbackSize: number) {
  const size = Number(/\*\s*([\d.]+)px/.exec(span.style.fontSize)?.[1]) || fallbackSize
  const f = span.style.fontFamily.toLowerCase()
  const fontFamily = f.includes('monospace') ? 'Courier New' : f.includes('serif') && !f.includes('sans-serif') ? 'Times New Roman' : 'Helvetica'
  return { size, fontFamily }
}

export function PageView({ doc, pageIndex, pageId, pageSize, scale, rotation, totalRotation, width, height, root }: Props) {
  const [wrapRef, near] = useNearViewport<HTMLDivElement>(root, '200% 0px')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!near) return
    let cancelled = false
    let task: RenderTask | null = null
    let text: TextLayer | null = null
    const canvas = canvasRef.current
    const textDiv = textRef.current
    if (!canvas || !textDiv) return

    ;(async () => {
      const page = await doc.getPage(pageIndex + 1)
      if (cancelled) return
      const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] })
      await task.promise
      if (cancelled) return
      setFailed(false)
      textDiv.replaceChildren()
      textDiv.style.setProperty('--total-scale-factor', String(scale))
      const { TextLayer } = await loadPdfjs()
      if (cancelled) return
      text = new TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport })
      await text.render()
    })().catch((e: unknown) => {
      if (!cancelled && (e as Error)?.name !== 'RenderingCancelledException') setFailed(true)
    })

    return () => {
      cancelled = true
      task?.cancel()
      text?.cancel()
    }
  }, [near, doc, pageIndex, scale, rotation])

  const editTool = useTools((s) => s.tool === 'edittext')
  const hits = useViewer((s) => s.hits)
  const activeHit = useViewer((s) => s.activeHit)
  const matches = hits.flatMap((h, i) => (h.pageIndex === pageIndex ? h.rects.map((r) => ({ r, active: i === activeHit })) : []))
  const toView = createPageTransform({ pageSize, rotation: totalRotation, scale })

  /** Edit text tool: clicking a run of page text covers it and opens an editor pre-filled with its content. */
  const onTextClick = (e: React.MouseEvent) => {
    if (!editTool || !pageId) return
    const span = (e.target as HTMLElement).closest<HTMLElement>('.textLayer span')
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    const original = span?.textContent ?? ''
    if (!span || !wrap || !canvas || !original.trim()) return
    if (totalRotation !== 0) {
      useNotice.getState().show('info', 'Edit text works on unrotated pages. Rotate the page back to 0° first.')
      return
    }
    const box = wrap.getBoundingClientRect()
    const r = span.getBoundingClientRect()
    const local = { x: r.left - box.left, y: r.top - box.top, width: r.width, height: r.height }
    const page = createPageTransform({ pageSize, rotation: totalRotation, scale }).rectToPage(local)
    const colors = sampleColors(canvas, local, window.devicePixelRatio || 1)
    const font = spanFont(span, page.height * 0.85)
    const tools = useTools.getState()
    const id = useDocument.getState().add({
      type: 'textedit',
      pageId,
      bounds: { x: page.x - 1, y: page.y - 0.5, width: page.width + 2, height: page.height + 1 },
      originalText: original,
      text: original,
      coverColor: colors.background,
      style: { color: colors.text, fontFamily: font.fontFamily, fontSize: font.size, align: 'left' },
    })
    tools.set({ selectedId: id, editingId: id })
  }

  // Release the bitmap when the page scrolls far away.
  useEffect(() => {
    if (near) return
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
    textRef.current?.replaceChildren()
  }, [near])

  return (
    <div
      ref={wrapRef}
      data-page={pageIndex + 1}
      className="relative mx-auto bg-white shadow-md"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="block" style={{ width, height }} />
      {near && matches.map(({ r, active }, i) => {
        const v = toView.rectToViewport(r)
        return (
          <div key={i} aria-hidden data-search-hit={active ? 'active' : 'other'} className="pointer-events-none absolute rounded-sm"
            style={{ left: v.x - 1, top: v.y - 1, width: v.width + 2, height: v.height + 2, background: active ? 'rgba(255,140,0,0.45)' : 'rgba(255,230,0,0.4)', outline: active ? '2px solid rgb(255,140,0)' : 'none', mixBlendMode: 'multiply' }} />
        )
      })}
      <div ref={textRef} className={`textLayer${editTool ? ' edit-text' : ''}`} onClick={onTextClick} />
      {near && pageId && (
        <Suspense fallback={null}>
          <AnnotationLayer pageId={pageId} pageSize={pageSize} rotation={totalRotation} scale={scale} />
        </Suspense>
      )}
      {failed && (
        <p role="alert" className="absolute inset-0 grid place-items-center text-sm text-red-600">
          Page {pageIndex + 1} could not be rendered.
        </p>
      )}
    </div>
  )
}
