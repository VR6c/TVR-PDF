import { create } from 'zustand'
import type { PageId } from '../types'

export interface OcrWord {
  text: string
  /** Page space (unrotated, top-left origin). */
  x: number
  y: number
  width: number
  height: number
}

/** OCR results live in memory for the session; they are embedded at export. */
export const useOcr = create<{
  words: Map<PageId, OcrWord[]>
  setPage: (id: PageId, w: OcrWord[]) => void
  clear: () => void
}>((set) => ({
  words: new Map(),
  setPage: (id, w) => set((s) => ({ words: new Map(s.words).set(id, w) })),
  clear: () => set({ words: new Map() }),
}))
