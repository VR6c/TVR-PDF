import { create } from 'zustand'
import { useDocument } from './document'
import { newId } from '../types'
import type { DocumentMetadata, PageDecorations, PageId, UserBookmark } from '../types'

/**
 * Per-document extras written at export time: bookmarks, metadata edits, watermark/header/footer/page numbers.
 * Kept in localStorage by document id (small, best-effort) so they survive a reload without a database change.
 */
interface ExtrasState {
  docId: string | null
  bookmarks: UserBookmark[]
  metadata: DocumentMetadata
  decorations: PageDecorations
  addBookmark: (pageId: PageId, title: string) => void
  renameBookmark: (id: string, title: string) => void
  removeBookmark: (id: string) => void
  setMetadata: (m: DocumentMetadata) => void
  setDecorations: (d: PageDecorations) => void
}

const key = (id: string) => `pdf-studio:extras:${id}`
const empty = { bookmarks: [] as UserBookmark[], metadata: {} as DocumentMetadata, decorations: {} as PageDecorations }

function read(id: string): typeof empty {
  try {
    const raw = localStorage.getItem(key(id))
    return raw ? { ...empty, ...(JSON.parse(raw) as Partial<typeof empty>) } : empty
  } catch {
    return empty
  }
}

export const useExtras = create<ExtrasState>((set, get) => {
  const save = (patch: Partial<typeof empty>) => {
    set(patch)
    const { docId, bookmarks, metadata, decorations } = get()
    if (!docId) return
    try {
      localStorage.setItem(key(docId), JSON.stringify({ bookmarks, metadata, decorations }))
    } catch {
      /* storage full or blocked: extras then last for this session only */
    }
  }
  return {
    docId: null,
    ...empty,
    addBookmark: (pageId, title) => save({ bookmarks: [...get().bookmarks, { id: newId<string>(), pageId, title }] }),
    renameBookmark: (id, title) => save({ bookmarks: get().bookmarks.map((b) => (b.id === id ? { ...b, title } : b)) }),
    removeBookmark: (id) => save({ bookmarks: get().bookmarks.filter((b) => b.id !== id) }),
    setMetadata: (metadata) => save({ metadata }),
    setDecorations: (decorations) => save({ decorations }),
  }
})

// Follow the active document.
useDocument.subscribe((s, prev) => {
  if (s.docId === prev.docId) return
  useExtras.setState({ docId: s.docId, ...(s.docId ? read(s.docId) : empty) })
})
