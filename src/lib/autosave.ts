import { create } from 'zustand'
import { documentRepo } from './storage/repositories'
import { useDocument } from '../stores/document'
import { useViewer } from '../stores/viewer'
import { db } from './storage/db'
import type { SessionId } from '../types'

export const useSaveState = create<{ status: 'idle' | 'saving' | 'saved' | 'error'; error: string | null }>(() => ({
  status: 'idle',
  error: null,
}))

const DEBOUNCE_MS = 800
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let lastBytes: ArrayBuffer | null = null

/** Tells autosave the stored file already matches `bytes` (set when a document is opened or loaded). */
export function markFileStored(bytes: ArrayBuffer | null) {
  lastBytes = bytes
}

async function saveOnce(): Promise<void> {
  const s = useDocument.getState()
  if (!s.docId || !s.baseBytes || !s.dirty) return
  const snapshot = { annotations: s.annotations, pages: s.pages, bytes: s.baseBytes }
  useSaveState.setState({ status: 'saving', error: null })
  const r = await documentRepo.saveDraft(
    s.docId,
    {
      annotations: snapshot.annotations,
      pages: snapshot.pages,
      pageCount: snapshot.pages.length,
      ...(snapshot.bytes !== lastBytes ? { fileBuffer: snapshot.bytes } : {}),
    },
    s.revision,
  )
  if (!r.ok) {
    useSaveState.setState({ status: 'error', error: r.error.message })
    return
  }
  lastBytes = snapshot.bytes
  const now = useDocument.getState()
  const unchanged = now.annotations === snapshot.annotations && now.pages === snapshot.pages && now.baseBytes === snapshot.bytes
  if (unchanged) now.markSaved(r.value)
  else useDocument.setState({ revision: r.value })
  useSaveState.setState({ status: 'saved', error: null })
  void saveView()
}

/** Saves now (and again if edits arrived mid-save). */
export async function flushSave(): Promise<void> {
  clearTimeout(timer)
  while (running) await running
  running = saveOnce().finally(() => (running = null))
  await running
  if (useDocument.getState().dirty && useSaveState.getState().status !== 'error') await flushSave()
}

export async function saveView() {
  const id = useDocument.getState().docId
  if (!id) return
  const v = useViewer.getState()
  try {
    await db.documentSessions.put({
      id: id as unknown as SessionId, documentId: id, currentPage: v.currentPage,
      zoom: v.zoomMode, activeTool: 'select', sidebar: v.sidebarOpen ? v.sidebarTab : null, updatedAt: Date.now(),
    })
  } catch {
    /* view state is best-effort */
  }
}

export function startAutosave(): () => void {
  const unsub = useDocument.subscribe((s, prev) => {
    if (s.dirty && (s.annotations !== prev.annotations || s.pages !== prev.pages || s.baseBytes !== prev.baseBytes)) {
      clearTimeout(timer)
      timer = setTimeout(() => void flushSave(), DEBOUNCE_MS)
    }
  })
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave()
  }
  const onUnload = () => void flushSave()
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onUnload)
  return () => {
    unsub()
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onUnload)
  }
}
