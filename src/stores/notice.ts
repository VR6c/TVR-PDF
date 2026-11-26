import { create } from 'zustand'

export interface NoticeAction {
  label: string
  run: () => void
}

/** One transient message line for outcomes of background operations. */
export const useNotice = create<{
  kind: 'info' | 'error' | null
  text: string
  action: NoticeAction | null
  show: (kind: 'info' | 'error', text: string, action?: NoticeAction) => void
  dismiss: () => void
}>((set) => ({
  kind: null,
  text: '',
  action: null,
  show: (kind, text, action) => set({ kind, text, action: action ?? null }),
  dismiss: () => set({ kind: null, text: '', action: null }),
}))
