import { ChevronLeft, ChevronRight, Maximize2, RotateCw, StretchHorizontal, ZoomIn, ZoomOut } from 'lucide-react'
import { useState } from 'react'
import { useSaveState } from '../../lib/autosave'
import { useViewer } from '../../stores/viewer'
import { IconButton } from '../common/IconButton'

export function StatusBar() {
  const { doc, currentPage, scale, zoomMode, goToPage, zoomBy, setZoomMode, rotate } = useViewer()
  const saveStatus = useSaveState((s) => s.status)
  // null = show the current page; a string is what the user is typing.
  const [typed, setDraft] = useState<string | null>(null)
  const draft = typed ?? String(currentPage)
  if (!doc) return <footer className="h-9 shrink-0 border-t border-border bg-surface" />

  return (
    <footer className="flex shrink-0 items-center justify-between gap-1 border-t border-border bg-surface px-1 pb-[env(safe-area-inset-bottom)] text-muted sm:px-2 [&>div]:h-9">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <IconButton icon={ChevronLeft} label="Previous page" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} />
        <form onSubmit={(e) => { e.preventDefault(); const n = Number(draft); if (Number.isFinite(n)) goToPage(n); setDraft(null) }}>
          <input aria-label="Page number" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setDraft(null)} className="w-10 rounded border border-border bg-bg px-1 py-0.5 text-center text-text sm:w-12" />
        </form>
        <span className="whitespace-nowrap">of {doc.numPages}</span>
        <IconButton icon={ChevronRight} label="Next page" disabled={currentPage >= doc.numPages} onClick={() => goToPage(currentPage + 1)} />
      </div>
      <span className="hidden text-xs sm:inline">{saveStatus === 'error' ? 'Local save unavailable' : 'Ready'}</span>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <IconButton icon={ZoomOut} label="Zoom out" onClick={() => zoomBy(1 / 1.25)} />
        <span aria-live="polite" className="w-11 text-center tabular-nums sm:w-12">{Math.round(scale * 100)}%</span>
        <IconButton icon={ZoomIn} label="Zoom in" onClick={() => zoomBy(1.25)} />
        <IconButton icon={StretchHorizontal} label="Fit to width" className="max-sm:hidden" active={zoomMode === 'fit-width'} onClick={() => setZoomMode('fit-width')} />
        <IconButton icon={Maximize2} label="Fit to page" className="max-sm:hidden" active={zoomMode === 'fit-page'} onClick={() => setZoomMode('fit-page')} />
        <IconButton icon={RotateCw} label="Rotate view clockwise" className="max-sm:hidden" onClick={rotate} />
      </div>
    </footer>
  )
}
