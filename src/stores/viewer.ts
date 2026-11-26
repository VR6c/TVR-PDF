import type { PDFDocumentProxy } from 'pdfjs-dist'
import { create } from 'zustand'
import type { OutlineNode, SearchHit } from '../lib/pdf/engine'
import type { Rotation } from '../types'

export const MIN_ZOOM = 0.25
export const MAX_ZOOM = 4

export type ZoomMode = number | 'fit-width' | 'fit-page'
export type SidebarTab = 'thumbnails' | 'outline' | 'search' | 'forms'

interface ViewerState {
  doc: PDFDocumentProxy | null
  fileName: string
  fileSize: number
  /** Original bytes, kept for persistence and export. */
  bytes: ArrayBuffer | null
  currentPage: number
  zoomMode: ZoomMode
  /** Effective CSS-px-per-point scale, written by the viewer once fit modes are resolved. */
  scale: number
  rotation: Rotation
  sidebarOpen: boolean
  sidebarTab: SidebarTab
  outline: OutlineNode[]
  query: string
  hits: SearchHit[]
  activeHit: number
  searching: boolean
  /** Bumped to ask the viewer to scroll to `currentPage`. */
  scrollTick: number

  setDocument: (doc: PDFDocumentProxy, bytes: ArrayBuffer, name: string) => void
  /** Swap the rendered PDF (after page edits / undo) while keeping view state. */
  replaceDocument: (doc: PDFDocumentProxy, bytes: ArrayBuffer) => void
  closeDocument: () => void
  setOutline: (o: OutlineNode[]) => void
  goToPage: (page: number) => void
  setCurrentPage: (page: number) => void
  setZoomMode: (z: ZoomMode) => void
  zoomBy: (factor: number) => void
  setScale: (s: number) => void
  rotate: () => void
  toggleSidebar: (tab?: SidebarTab) => void
  setSearch: (p: Partial<Pick<ViewerState, 'query' | 'hits' | 'activeHit' | 'searching'>>) => void
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export const useViewer = create<ViewerState>((set, get) => ({
  doc: null,
  fileName: '',
  fileSize: 0,
  bytes: null,
  currentPage: 1,
  zoomMode: 'fit-width',
  scale: 1,
  rotation: 0,
  sidebarOpen: false,
  sidebarTab: 'thumbnails',
  outline: [],
  query: '',
  hits: [],
  activeHit: -1,
  searching: false,
  scrollTick: 0,

  setDocument: (doc, bytes, fileName) => {
    void get().doc?.loadingTask.destroy()
    set({
      doc,
      bytes,
      fileName,
      fileSize: bytes.byteLength,
      currentPage: 1,
      zoomMode: 'fit-width',
      rotation: 0,
      outline: [],
      query: '',
      hits: [],
      activeHit: -1,
      searching: false,
      sidebarOpen: window.innerWidth >= 768,
      sidebarTab: 'thumbnails',
    })
  },
  replaceDocument: (doc, bytes) => {
    void get().doc?.loadingTask.destroy()
    set((s) => ({ doc, bytes, fileSize: bytes.byteLength, currentPage: Math.min(s.currentPage, doc.numPages), hits: [], activeHit: -1 }))
  },
  closeDocument: () => {
    void get().doc?.loadingTask.destroy()
    set({ doc: null, bytes: null, fileName: '', fileSize: 0, outline: [], hits: [], query: '' })
  },
  setOutline: (outline) => set({ outline }),
  goToPage: (page) => {
    const doc = get().doc
    if (!doc) return
    set((s) => ({ currentPage: clamp(Math.round(page), 1, doc.numPages), scrollTick: s.scrollTick + 1 }))
  },
  setCurrentPage: (currentPage) => set({ currentPage }),
  setZoomMode: (zoomMode) => set({ zoomMode: typeof zoomMode === 'number' ? clamp(zoomMode, MIN_ZOOM, MAX_ZOOM) : zoomMode }),
  zoomBy: (factor) =>
    set((s) => ({ zoomMode: clamp(Math.round(s.scale * factor * 100) / 100, MIN_ZOOM, MAX_ZOOM) })),
  setScale: (scale) => set({ scale }),
  rotate: () => set((s) => ({ rotation: ((s.rotation + 90) % 360) as Rotation })),
  toggleSidebar: (tab) =>
    set((s) => (tab && (!s.sidebarOpen || s.sidebarTab !== tab) ? { sidebarOpen: true, sidebarTab: tab } : { sidebarOpen: !s.sidebarOpen })),
  setSearch: (p) => set(p),
}))
