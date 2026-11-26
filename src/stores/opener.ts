import { create } from 'zustand'
import { loadOutline, openPdf } from '../lib/pdf/engine'
import { mergeDocuments } from '../lib/pdf/pageOps'
import { startDocument } from '../lib/session'
import { documentRepo } from '../lib/storage/repositories'
import type { AppErrorCode, DocumentId, DocumentRecord } from '../types'
import { useViewer } from './viewer'

const MESSAGES: Partial<Record<AppErrorCode, string>> = {
  INVALID_PDF: 'That file is not a valid PDF.',
  CORRUPTED_PDF: 'That PDF appears to be damaged and could not be read.',
  UNSUPPORTED_ENCRYPTION: 'That PDF uses encryption this app cannot open.',
  INTERNAL: 'Something went wrong while opening the PDF.',
}

interface PendingPassword {
  bytes: ArrayBuffer
  name: string
  wrong: boolean
  stored?: DocumentRecord
}

interface OpenerState {
  busy: boolean
  error: string | null
  notice: string | null
  pendingPassword: PendingPassword | null
  pendingCombine: File[] | null
  confirmCombine: () => Promise<void>
  openFirstOnly: () => Promise<void>
  cancelCombine: () => void
  openFiles: (files: File[]) => Promise<void>
  openFile: (file: File) => Promise<void>
  openStored: (id: DocumentId, opts?: { recovered?: boolean }) => Promise<boolean>
  submitPassword: (password: string) => Promise<void>
  cancelPassword: () => void
  dismissError: () => void
  dismissNotice: () => void
}

const isPdf = (f: File) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

export const useOpener = create<OpenerState>((set, get) => {
  async function attempt(bytes: ArrayBuffer, name: string, password?: string, stored?: DocumentRecord): Promise<boolean> {
    set({ busy: true, error: null })
    const result = await openPdf(bytes, { password })
    if (result.ok) {
      const pdf = result.value
      set({ pendingPassword: null })
      const storageError = await startDocument({ pdf, bytes, name, encrypted: password !== undefined, stored })
      set({ busy: false, error: storageError ? `${storageError.message} You can still view and annotate it, but changes won't be saved.` : null })
      loadOutline(pdf)
        .then((o) => useViewer.getState().doc === pdf && useViewer.getState().setOutline(o))
        .catch(() => undefined)
      return true
    }
    const { code } = result.error
    if (code === 'PASSWORD_REQUIRED' || code === 'PASSWORD_INCORRECT') {
      set({ busy: false, pendingPassword: { bytes, name, stored, wrong: code === 'PASSWORD_INCORRECT' } })
      return false
    }
    set({ busy: false, pendingPassword: null, error: MESSAGES[code] ?? MESSAGES.INTERNAL! })
    return false
  }

  return {
    busy: false,
    error: null,
    notice: null,
    pendingPassword: null,
    pendingCombine: null,

    openFile: (file) => get().openFiles([file]),
    openFiles: async (files) => {
      const pdfs = files.filter(isPdf)
      if (!pdfs.length) {
        set({ error: 'Please choose a PDF file.' })
        return
      }
      try {
        if (pdfs.length > 1) {
          set({ pendingCombine: pdfs })
          return
        }
        await attempt(await pdfs[0].arrayBuffer(), pdfs[0].name)
      } catch {
        set({ busy: false, error: 'The file could not be read.' })
      }
    },

    confirmCombine: async () => {
      const pdfs = get().pendingCombine
      if (!pdfs) return
      set({ pendingCombine: null, busy: true, error: null })
      try {
        const merged = await mergeDocuments(await Promise.all(pdfs.map((f) => f.arrayBuffer())))
        if (!merged.ok) {
          set({ busy: false, error: `Could not combine these PDFs: ${merged.error.message}` })
          return
        }
        const bytes = merged.value.slice().buffer as ArrayBuffer
        if (await attempt(bytes, 'Combined.pdf')) set({ notice: `Combined ${pdfs.length} PDFs into one document.` })
      } catch {
        set({ busy: false, error: 'The files could not be read.' })
      }
    },
    openFirstOnly: async () => {
      const first = get().pendingCombine?.[0]
      set({ pendingCombine: null })
      if (first) await get().openFiles([first])
    },
    cancelCombine: () => set({ pendingCombine: null }),

    openStored: async (id, opts) => {
      const r = await documentRepo.get(id)
      if (!r.ok) {
        set({ error: r.error.message })
        return false
      }
      const ok = await attempt(r.value.fileBuffer, r.value.fileName, undefined, r.value)
      if (ok && opts?.recovered) set({ notice: `Restored “${r.value.fileName}” from your last session.` })
      return ok
    },

    submitPassword: async (password) => {
      const p = get().pendingPassword
      if (p) await attempt(p.bytes, p.name, password, p.stored)
    },
    cancelPassword: () => set({ pendingPassword: null }),
    dismissError: () => set({ error: null }),
    dismissNotice: () => set({ notice: null }),
  }
})

/** Opens the native file picker. File contents stay in memory and local storage only. */
export function pickPdf() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/pdf,.pdf'
  input.multiple = true
  input.onchange = () => {
    const files = [...(input.files ?? [])]
    if (files.length) void useOpener.getState().openFiles(files)
  }
  input.click()
}
