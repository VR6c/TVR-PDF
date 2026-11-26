import { useEffect } from 'react'
import { flushSave } from '../lib/autosave'
import { useDocument } from '../stores/document'
import { useNotice } from '../stores/notice'
import { pickPdf } from '../stores/opener'
import { useTools } from '../stores/tools'
import { useUI } from '../stores/ui'
import { useViewer } from '../stores/viewer'

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/** Open, Save, Find, Undo/Redo, Print, Delete and Escape. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const hasDoc = !!useViewer.getState().doc
      const key = e.key.toLowerCase()

      if (e.key === 'Escape' && !typing(e.target)) {
        useTools.getState().setTool('select')
        return
      }
      if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && !typing(e.target) && !document.querySelector('dialog[open]')) {
        const id = useTools.getState().selectedId
        if (id) {
          e.preventDefault()
          useDocument.getState().remove(id)
          useTools.getState().set({ selectedId: null })
        }
        return
      }
      if (!mod || e.altKey) return
      if (key === 'o') {
        e.preventDefault()
        pickPdf()
      } else if (!hasDoc) {
        return
      } else if (key === 'f') {
        e.preventDefault()
        useViewer.getState().toggleSidebar('search')
        document.getElementById('search-input')?.focus()
      } else if (key === 's') {
        e.preventDefault()
        void flushSave().then(() => useNotice.getState().show('info', 'Saved on this device. Use Export to create a PDF file.'))
      } else if (key === 'p') {
        e.preventDefault()
        useUI.getState().open('print')
      } else if (key === 'z' && !typing(e.target)) {
        e.preventDefault()
        if (e.shiftKey) useDocument.getState().redo()
        else useDocument.getState().undo()
      } else if (key === 'y' && !typing(e.target)) {
        e.preventDefault()
        useDocument.getState().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
