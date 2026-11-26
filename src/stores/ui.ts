import { create } from 'zustand'

export type DialogId = 'signature' | 'pages' | 'export' | 'print' | 'ocr' | 'info' | 'storage' | 'annotations' | 'images' | 'compare' | 'unlock' | null

export const useUI = create<{ dialog: DialogId; open: (d: Exclude<DialogId, null>) => void; close: () => void; propsOpen: boolean; toggleProps: () => void }>((set) => ({
  dialog: null,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: null }),
  /** Bottom sheet below the lg breakpoint; the panel is always docked above it. */
  propsOpen: false,
  toggleProps: () => set((s) => ({ propsOpen: !s.propsOpen })),
}))
