import type { PDFDocumentProxy } from 'pdfjs-dist'
import { create } from 'zustand'
import { useDocument } from '../stores/document'
import { useOcr } from '../stores/ocr'
import { useTools } from '../stores/tools'
import { useViewer } from '../stores/viewer'
import { newId } from '../types'
import type { Annotation, AppError, DocumentId, DocumentRecord, PageId, PageRef } from '../types'
import { flushSave, markFileStored, saveView, useSaveState } from './autosave'
import { db } from './storage/db'
import { documentRepo } from './storage/repositories'
import { updatePreferences } from './storage/settings'

export const freshPages = (count: number): PageRef[] =>
  Array.from({ length: count }, (_, i) => ({ pageId: newId<PageId>(), sourceIndex: 0, sourcePageIndex: i, rotation: 0 }))

export interface OpenTab {
  id: DocumentId
  name: string
}

/** Documents open in tabs. Each is fully autosaved, so switching reloads it from local storage. */
export const useTabs = create<{ tabs: OpenTab[]; set: (t: OpenTab[]) => void }>((set) => ({ tabs: [], set: (tabs) => set({ tabs }) }))

export interface StartOptions {
  pdf: PDFDocumentProxy
  bytes: ArrayBuffer
  name: string
  encrypted: boolean
  stored?: DocumentRecord
}

/** Makes a parsed PDF the active document. Returns a storage error if it can't be persisted (viewing still works). */
export async function startDocument({ pdf, bytes, name, encrypted, stored }: StartOptions): Promise<AppError | null> {
  await flushSave()
  let storageError: AppError | null = null
  let docId: DocumentId | null = null
  let revision = 0
  let pages = freshPages(pdf.numPages)
  let annotations: Annotation[] = []

  if (stored) {
    docId = stored.id
    revision = stored.revision
    annotations = [...stored.annotations]
    if (stored.pages.length === pdf.numPages) pages = [...stored.pages]
    await documentRepo.touch(stored.id)
  } else {
    const created = await documentRepo.create(name, bytes, pdf.numPages)
    if (created.ok) docId = created.value
    else storageError = created.error
  }

  useOcr.getState().clear()
  useTools.getState().set({ selectedId: null, editingId: null, tool: 'select' })
  useDocument.getState().load({ docId: docId as DocumentId, bytes, pages, annotations, revision, encrypted })
  if (!docId) useDocument.setState({ docId: null })
  markFileStored(docId ? bytes : null)
  useSaveState.setState({ status: docId ? 'saved' : 'error', error: storageError?.message ?? null })
  useViewer.getState().setDocument(pdf, bytes, name)

  if (docId) {
    const id = docId
    const tabs = useTabs.getState().tabs
    useTabs.getState().set(tabs.some((t) => t.id === id) ? tabs.map((t) => (t.id === id ? { ...t, name } : t)) : [...tabs, { id, name }])
    void updatePreferences({ lastDocId: id })
    const view = await db.documentSessions.get(id as unknown as import('../types').SessionId).catch(() => undefined)
    if (view) {
      useViewer.getState().setZoomMode(view.zoom)
      useViewer.getState().goToPage(view.currentPage)
    }
  }
  return storageError
}

export async function closeDocument(): Promise<void> {
  await saveView()
  await flushSave()
  const id = useDocument.getState().docId
  if (id) useTabs.getState().set(useTabs.getState().tabs.filter((t) => t.id !== id))
  useDocument.getState().reset()
  useViewer.getState().closeDocument()
  useOcr.getState().clear()
  markFileStored(null)
  useSaveState.setState({ status: 'idle', error: null })
  void updatePreferences({ lastDocId: null })
}
