import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPageTransform } from '../../lib/geometry/transform'
import { useDocument } from '../../stores/document'
import { MARKUP_TOOLS, useTools } from '../../stores/tools'
import { MAX_ZOOM, MIN_ZOOM, useViewer } from '../../stores/viewer'
import type { PageRect, Rotation } from '../../types'
import { PageView } from './PageView'

const GAP = 12
const PAD = 16

interface PageInfo {
  /** Unrotated size in PDF points. */
  w: number
  h: number
  /** Intrinsic /Rotate. */
  rotate: number
}

async function readInfo(doc: PDFDocumentProxy, index: number): Promise<PageInfo> {
  const page = await doc.getPage(index + 1)
  const [x0, y0, x1, y1] = page.view
  const info = { w: x1 - x0, h: y1 - y0, rotate: page.rotate }
  page.cleanup()
  return info
}

/** Page sizes are loaded progressively: every page starts at page 1's size, then real sizes stream in. */
function usePageInfo(doc: PDFDocumentProxy) {
  const [infos, setInfos] = useState<PageInfo[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const first = await readInfo(doc, 0)
      if (cancelled) return
      const all = Array.from({ length: doc.numPages }, () => first)
      setInfos(all)
      for (let i = 1; i < doc.numPages; i += 25) {
        const chunk = await Promise.all(
          Array.from({ length: Math.min(25, doc.numPages - i) }, (_, k) => readInfo(doc, i + k)),
        )
        if (cancelled) return
        chunk.forEach((c, k) => (all[i + k] = c))
        setInfos(all.slice())
      }
    })().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [doc])
  return infos
}

/** Client rects of the selected text, per text-layer span, clamped to the selection. */
function selectionRects(range: Range, container: Element): DOMRect[] {
  const out: DOMRect[] = []
  for (const span of container.querySelectorAll('.textLayer span')) {
    if (!range.intersectsNode(span)) continue
    const r = document.createRange()
    r.selectNodeContents(span)
    if (r.compareBoundaryPoints(Range.START_TO_START, range) < 0) r.setStart(range.startContainer, range.startOffset)
    if (r.compareBoundaryPoints(Range.END_TO_END, range) > 0) r.setEnd(range.endContainer, range.endOffset)
    for (const rect of r.getClientRects()) if (rect.width > 1 && rect.height > 1) out.push(rect)
  }
  return out
}

export function Viewer({ doc }: { doc: PDFDocumentProxy }) {
  const pages = useDocument((s) => s.pages)
  const { zoomMode, rotation, currentPage, scrollTick, setScale, setCurrentPage } = useViewer()
  const [root, setRootState] = useState<HTMLDivElement | null>(null)
  // The ref is for imperative scrolling; the state re-runs the effects that attach listeners.
  const rootRef = useRef<HTMLDivElement | null>(null)
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    rootRef.current = el
    setRootState(el)
  }, [])
  const [box, setBox] = useState({ w: 0, h: 0 })
  const infos = usePageInfo(doc)

  useEffect(() => {
    if (!root) return
    const ro = new ResizeObserver(() => setBox({ w: root.clientWidth, h: root.clientHeight }))
    ro.observe(root)
    return () => ro.disconnect()
  }, [root])

  const dims = useMemo(
    () =>
      infos.map((p) => {
        const swap = (p.rotate + rotation) % 180 !== 0
        return { w: swap ? p.h : p.w, h: swap ? p.w : p.h }
      }),
    [infos, rotation],
  )

  const scale = useMemo(() => {
    if (typeof zoomMode === 'number') return zoomMode
    if (!dims.length || !box.w) return 1
    const fitW = (box.w - PAD * 2) / Math.max(...dims.map((d) => d.w))
    const s = zoomMode === 'fit-width' ? fitW : Math.min(fitW, (box.h - PAD * 2) / dims[0].h)
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s))
  }, [zoomMode, dims, box])

  useEffect(() => setScale(scale), [scale, setScale])

  const { offsets, total } = useMemo(() => {
    const offsets: number[] = []
    let y = PAD
    for (const d of dims) {
      offsets.push(y)
      y += d.h * scale + GAP
    }
    return { offsets, total: y - GAP + PAD }
  }, [dims, scale])

  // Keep the reading position when zoom/rotation/size data changes the document height.
  const prevTotal = useRef(0)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (el && prevTotal.current && total !== prevTotal.current) {
      el.scrollTop = (el.scrollTop / prevTotal.current) * total
    }
    prevTotal.current = total
  }, [total, root])

  useEffect(() => {
    const el = rootRef.current
    if (el && offsets[currentPage - 1] !== undefined) el.scrollTop = offsets[currentPage - 1] - PAD
    // Only an explicit navigation request (scrollTick) should scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollTick])

  // Highlight / underline / strikethrough: turn the current text selection into markup on release.
  useEffect(() => {
    if (!root) return
    const onUp = () => {
      const tools = useTools.getState()
      if (!MARKUP_TOOLS.has(tools.tool)) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      for (const wrap of root.querySelectorAll<HTMLElement>('[data-page]')) {
        const idx = Number(wrap.dataset.page) - 1
        const info = infos[idx]
        const pageId = pages[idx]?.pageId
        if (!info || !pageId || !range.intersectsNode(wrap)) continue
        const box = wrap.getBoundingClientRect()
        const t = createPageTransform({
          pageSize: { width: info.w, height: info.h },
          rotation: ((info.rotate + rotation) % 360) as Rotation,
          scale,
        })
        const quads: PageRect[] = selectionRects(range, wrap).map((r) =>
          t.rectToPage({ x: r.left - box.left, y: r.top - box.top, width: r.width, height: r.height }),
        )
        if (quads.length) {
          useDocument.getState().add({ type: tools.tool as 'highlight', pageId, quads, color: tools.color, opacity: tools.opacity })
        }
      }
      sel.removeAllRanges()
    }
    root.addEventListener('pointerup', onUp)
    return () => root.removeEventListener('pointerup', onUp)
  }, [root, infos, pages, rotation, scale])

  useEffect(() => {
    if (!root) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const mid = root.scrollTop + root.clientHeight / 2
        let lo = 0
        let hi = offsets.length - 1
        while (lo < hi) {
          const m = (lo + hi + 1) >> 1
          if (offsets[m] <= mid) lo = m
          else hi = m - 1
        }
        if (offsets.length) setCurrentPage(lo + 1)
      })
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      root.removeEventListener('scroll', onScroll)
    }
  }, [root, offsets, setCurrentPage])

  return (
    <div ref={setRoot} className="h-full overflow-auto bg-workspace" tabIndex={0} aria-label="Document pages">
      <div className="flex flex-col" style={{ gap: GAP, padding: PAD, minWidth: 'min-content' }}>
        {dims.map((d, i) => (
          <PageView
            key={i}
            doc={doc}
            pageIndex={i}
            pageId={pages.length === doc.numPages ? pages[i]?.pageId : undefined}
            pageSize={{ width: infos[i].w, height: infos[i].h }}
            totalRotation={((infos[i].rotate + rotation) % 360) as Rotation}
            scale={scale}
            rotation={rotation}
            width={d.w * scale}
            height={d.h * scale}
            root={root}
          />
        ))}
      </div>
    </div>
  )
}
