import { create } from 'zustand'
import { temporal } from 'zundo'
import type { Annotation, AnnotationId, AnnotationPatch, AnnotationStore, DocumentId, NewAnnotation, PageId, PagePoint, PageRef } from '../types'
import { newId } from '../types'

/** The undoable part of a document. Page edits change `baseBytes`; annotation edits don't. */
interface Undoable {
  baseBytes: ArrayBuffer | null
  pages: PageRef[]
  annotations: Annotation[]
}

interface DocState extends Undoable, AnnotationStore {
  docId: DocumentId | null
  /** Repository revision of the last successful draft save. */
  revision: number
  /** Edits since the last save. */
  dirty: boolean
  /** Encrypted sources can be viewed and annotated but not exported (pdf-lib can't re-write them). */
  encrypted: boolean
  load: (d: { docId: DocumentId; bytes: ArrayBuffer; pages: PageRef[]; annotations: Annotation[]; revision: number; encrypted: boolean }) => void
  reset: () => void
  /** Replace the working PDF and page list in one undo step (reorder, delete, rotate, merge…). */
  replaceBase: (bytes: ArrayBuffer, pages: PageRef[], annotations?: Annotation[]) => void
  replaceAnnotations: (annotations: Annotation[]) => void
  /** Swap in a decrypted copy of an encrypted source; history is cleared because older steps hold the encrypted bytes. */
  unlock: (bytes: ArrayBuffer) => void
  markSaved: (revision: number) => void
  undo: () => void
  redo: () => void
}

const initial: Undoable = { baseBytes: null, pages: [], annotations: [] }
let gestureStart: Undoable | null = null

export const useDocument = create<DocState>()(
  temporal(
    (set, get): DocState => {
      const edit = (fn: (a: Annotation[]) => Annotation[]) =>
        set((s) => ({ annotations: fn(s.annotations), dirty: true }))
      const topZ = (pageId: PageId) =>
        get().annotations.reduce((z, a) => (a.pageId === pageId ? Math.max(z, a.zIndex) : z), 0) + 1

      return {
        ...initial,
        docId: null,
        revision: 0,
        dirty: false,
        encrypted: false,

        load: ({ docId, bytes, pages, annotations, revision, encrypted }) => {
          gestureStart = null
          set({ docId, baseBytes: bytes, pages, annotations, revision, encrypted, dirty: false })
          useDocument.temporal.getState().clear()
          useDocument.setState({ dirty: false }) // the history entry created by the set() above flagged it
        },
        reset: () => {
          gestureStart = null
          set({ ...initial, docId: null, revision: 0, dirty: false, encrypted: false })
          useDocument.temporal.getState().clear()
          useDocument.setState({ dirty: false })
        },

        replaceBase: (baseBytes, pages, annotations) =>
          set((s) => ({ baseBytes, pages, annotations: annotations ?? s.annotations, dirty: true })),
        replaceAnnotations: (annotations) => set({ annotations, dirty: true }),
        unlock: (baseBytes) => {
          set({ baseBytes, encrypted: false, dirty: true })
          useDocument.temporal.getState().clear()
        },
        markSaved: (revision) => set({ revision, dirty: false }),

        list: (pageId) => get().annotations.filter((a) => a.pageId === pageId).sort((a, b) => a.zIndex - b.zIndex),
        get: (id) => get().annotations.find((a) => a.id === id),

        add: (input: NewAnnotation) => {
          const id = newId<AnnotationId>()
          const now = Date.now()
          edit((list) => [...list, { ...input, id, zIndex: topZ(input.pageId), createdAt: now, updatedAt: now } as Annotation])
          return id
        },
        update: (id, patch: AnnotationPatch) =>
          edit((list) => list.map((a) => (a.id === id ? ({ ...a, ...patch, updatedAt: Date.now() } as Annotation) : a))),
        remove: (id) => edit((list) => list.filter((a) => a.id !== id)),
        moveToPage: (id, pageId, at: PagePoint) =>
          edit((list) =>
            list.map((a) => {
              if (a.id !== id) return a
              const moved = { ...a, pageId, zIndex: topZ(pageId), updatedAt: Date.now() } as Annotation
              return 'bounds' in moved ? ({ ...moved, bounds: { ...moved.bounds, x: at.x, y: at.y } } as Annotation) : moved
            }),
          ),

        // A gesture (drag, resize, freehand stroke) is many store writes but ONE undo step.
        beginGesture: () => {
          if (gestureStart) return
          const { baseBytes, pages, annotations } = get()
          gestureStart = { baseBytes, pages, annotations }
          useDocument.temporal.getState().pause()
        },
        commitGesture: () => {
          if (!gestureStart) throw new Error('commitGesture without beginGesture')
          const before = gestureStart
          gestureStart = null
          const t = useDocument.temporal
          t.getState().resume()
          if (before.annotations !== get().annotations || before.pages !== get().pages) {
            t.setState((s) => ({ pastStates: [...s.pastStates, before], futureStates: [] }))
          }
        },
        cancelGesture: () => {
          if (!gestureStart) return
          const before = gestureStart
          gestureStart = null
          set({ ...before })
          useDocument.temporal.getState().resume()
        },

        undo: () => useDocument.temporal.getState().undo(),
        redo: () => useDocument.temporal.getState().redo(),
      }
    },
    {
      limit: 50,
      partialize: ({ baseBytes, pages, annotations }): Undoable => ({ baseBytes, pages, annotations }),
      equality: (a, b) => a.baseBytes === b.baseBytes && a.pages === b.pages && a.annotations === b.annotations,
    },
  ),
)

/** After undo/redo, `dirty` isn't part of history, so mark it explicitly. `clear()` (on load) empties both stacks and is not an edit. */
useDocument.temporal.subscribe((s, prev) => {
  const changed = s.pastStates.length !== prev.pastStates.length || s.futureStates.length !== prev.futureStates.length
  if (changed && s.pastStates.length + s.futureStates.length > 0) {
    useDocument.setState({ dirty: true })
  }
})
