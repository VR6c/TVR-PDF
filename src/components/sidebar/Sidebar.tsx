import { Bookmark, ChevronRight, ListTree, Trash2, Search as SearchIcon, LayoutGrid, TextCursorInput } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { searchDocument } from '../../lib/pdf/engine'
import type { OutlineNode } from '../../lib/pdf/engine'
import { useDocument } from '../../stores/document'
import { useExtras } from '../../stores/extras'
import { useViewer } from '../../stores/viewer'
import type { SidebarTab } from '../../stores/viewer'
import { FormsPanel } from './FormsPanel'
import { Thumbnail } from './Thumbnail'

const TABS: { id: SidebarTab; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'thumbnails', label: 'Pages', icon: LayoutGrid },
  { id: 'outline', label: 'Bookmarks', icon: ListTree },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'forms', label: 'Forms', icon: TextCursorInput },
]

export function Sidebar() {
  const tab = useViewer((s) => s.sidebarTab)
  const toggleSidebar = useViewer((s) => s.toggleSidebar)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:w-72 max-md:max-w-[85vw] max-md:shadow-xl">
      <div role="tablist" className="flex border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => toggleSidebar(t.id)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] hover:bg-surface-2 pointer-coarse:py-2.5 ${tab === t.id ? 'border-b-2 border-accent font-medium text-accent' : 'text-muted'}`}
          >
            <t.icon size={16} aria-hidden />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div ref={setRoot} className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'thumbnails' && <Thumbnails root={root} />}
        {tab === 'outline' && <Outline />}
        {tab === 'search' && <SearchPanel />}
        {tab === 'forms' && <FormsPanel />}
      </div>
    </aside>
  )
}

function Thumbnails({ root }: { root: Element | null }) {
  const { doc, currentPage, rotation, goToPage } = useViewer()
  if (!doc) return null
  const select = (n: number) => {
    goToPage(n)
    if (window.matchMedia('(max-width: 767px)').matches) useViewer.getState().toggleSidebar()
  }
  return (
    <div className="flex flex-col items-center p-2">
      {Array.from({ length: doc.numPages }, (_, i) => (
        <Thumbnail key={i} doc={doc} pageIndex={i} rotation={rotation} root={root} active={currentPage === i + 1} onSelect={() => select(i + 1)} />
      ))}
    </div>
  )
}

function Outline() {
  const outline = useViewer((s) => s.outline)
  return (
    <>
      <MyBookmarks />
      {outline.length ? <OutlineList nodes={outline} depth={0} /> : <p className="p-4 text-center text-muted">This document has no outline.</p>}
    </>
  )
}

/** User bookmarks: saved per document and written into the PDF outline on export. */
function MyBookmarks() {
  const pages = useDocument((s) => s.pages)
  const { bookmarks, addBookmark, renameBookmark, removeBookmark } = useExtras()
  const currentPage = useViewer((s) => s.currentPage)
  const goToPage = useViewer((s) => s.goToPage)
  const shown = bookmarks.flatMap((b) => {
    const at = pages.findIndex((p) => p.pageId === b.pageId)
    return at < 0 ? [] : [{ b, page: at + 1 }]
  })
  const add = () => {
    const page = pages[currentPage - 1]
    if (page) addBookmark(page.pageId, `Page ${currentPage}`)
  }
  return (
    <div className="border-b border-border p-2">
      <button type="button" onClick={add} disabled={!pages.length} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border px-2 py-1.5 hover:bg-surface-2 disabled:opacity-50">
        <Bookmark size={14} aria-hidden /> Bookmark page {currentPage}
      </button>
      {shown.length > 0 && (
        <ul className="mt-2" aria-label="Your bookmarks">
          {shown.map(({ b, page }) => (
            <li key={b.id} className="flex items-center gap-1">
              <button type="button" onClick={() => goToPage(page)} className="rounded px-1.5 py-1 text-xs text-muted hover:bg-surface-2" aria-label={`Go to page ${page}`}>p.{page}</button>
              <input aria-label={`Bookmark title, page ${page}`} value={b.title} onChange={(e) => renameBookmark(b.id, e.target.value)} className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-1 hover:border-border" />
              <button type="button" onClick={() => removeBookmark(b.id)} aria-label={`Delete bookmark ${b.title}`} className="rounded p-1.5 text-muted hover:bg-surface-2"><Trash2 size={13} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OutlineList({ nodes, depth }: { nodes: OutlineNode[]; depth: number }) {
  const goToPage = useViewer((s) => s.goToPage)
  return (
    <ul>
      {nodes.map((n, i) => (
        <li key={i}>
          <button
            type="button"
            disabled={n.pageIndex === null}
            onClick={() => n.pageIndex !== null && goToPage(n.pageIndex + 1)}
            style={{ paddingLeft: 8 + depth * 12 }}
            className="flex w-full items-center gap-1 py-2 pr-2 text-left hover:bg-surface-2 disabled:text-muted"
          >
            {n.children.length > 0 && <ChevronRight size={12} aria-hidden />}
            <span className="truncate">{n.title}</span>
          </button>
          {n.children.length > 0 && <OutlineList nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  )
}

function SearchPanel() {
  const { doc, query, hits, activeHit, searching, setSearch, goToPage } = useViewer()
  const abort = useRef<AbortController | null>(null)
  const [scanned, setScanned] = useState(0)

  useEffect(() => () => abort.current?.abort(), [])

  const run = async (q: string) => {
    abort.current?.abort()
    const trimmed = q.trim()
    setSearch({ hits: [], activeHit: -1, searching: !!trimmed })
    if (!doc || !trimmed) return
    const controller = new AbortController()
    abort.current = controller
    const all: typeof hits = []
    await searchDocument(doc, trimmed, controller.signal, (found, n) => {
      if (controller.signal.aborted) return
      all.push(...found)
      setScanned(n)
      setSearch({ hits: all.slice(), activeHit: all.length && found.length === all.length ? 0 : useViewer.getState().activeHit })
      if (all.length === found.length && found.length) goToPage(found[0].pageIndex + 1)
    }).catch(() => undefined)
    if (!controller.signal.aborted) setSearch({ searching: false })
  }

  const step = (dir: 1 | -1) => {
    if (!hits.length) return
    const next = (activeHit + dir + hits.length) % hits.length
    setSearch({ activeHit: next })
    goToPage(hits[next].pageIndex + 1)
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(query)
        }}
        className="flex gap-1"
      >
        <input
          id="search-input"
          type="search"
          autoFocus
          aria-label="Search in document"
          placeholder="Search…"
          value={query}
          onChange={(e) => setSearch({ query: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2.5 py-1.5"
        />
      </form>
      <div className="flex items-center justify-between text-xs text-muted" aria-live="polite">
        <span>
          {searching ? `Searching… ${scanned}/${doc?.numPages}` : query.trim() ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : ''}
        </span>
        <span className="flex gap-1">
          <button type="button" onClick={() => step(-1)} disabled={!hits.length} className="rounded px-2 py-1 hover:bg-surface-2 disabled:opacity-40 pointer-coarse:py-2">Prev</button>
          <button type="button" onClick={() => step(1)} disabled={!hits.length} className="rounded px-2 py-1 hover:bg-surface-2 disabled:opacity-40 pointer-coarse:py-2">Next</button>
        </span>
      </div>
      <ul>
        {hits.map((h, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => {
                setSearch({ activeHit: i })
                goToPage(h.pageIndex + 1)
              }}
              className={`w-full rounded px-2 py-1.5 text-left hover:bg-surface-2 ${i === activeHit ? 'bg-surface-2' : ''}`}
            >
              <span className="block text-xs text-muted">Page {h.pageIndex + 1}</span>
              <span className="line-clamp-2">{h.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
