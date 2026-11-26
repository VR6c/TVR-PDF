import { useDocument } from '../stores/document'
import { useViewer } from '../stores/viewer'
import { applyRedactions, browserRaster, groupByPage } from './pdf/redact'
import { useNotice } from '../stores/notice'

/**
 * Turns redaction marks into permanent redaction. Irreversible by design: undo history is
 * cleared afterwards, otherwise the pre-redaction PDF would stay recoverable in memory.
 */
export async function applyRedactionMarks(): Promise<void> {
  const doc = useDocument.getState()
  const pdf = useViewer.getState().doc
  if (!doc.baseBytes || !pdf) return
  if (doc.encrypted) return useNotice.getState().show('error', 'Redaction is not supported for encrypted PDFs.')
  const marks = doc.annotations.filter((a): a is Extract<typeof a, { type: 'redaction' }> => a.type === 'redaction')
  if (!marks.length) return
  const ok = window.confirm(
    `Permanently redact ${marks.length} area${marks.length === 1 ? '' : 's'}?\n\nAffected pages are converted to images with these areas blacked out. The hidden content is removed from the file, the pages stop being text-searchable, and this cannot be undone.`,
  )
  if (!ok) return

  const grouped = groupByPage(marks.map((m) => ({ pageId: m.pageId, bounds: m.bounds })), doc.pages)
  if (!grouped.ok) return useNotice.getState().show('error', grouped.error.message)
  useNotice.getState().show('info', 'Applying redactions…')
  const r = await applyRedactions({ bytes: doc.baseBytes, pdfjsDoc: pdf, regions: grouped.value }, browserRaster)
  if (!r.ok) return useNotice.getState().show('error', r.error.message)

  const bytes = r.value.buffer.slice(r.value.byteOffset, r.value.byteOffset + r.value.byteLength) as ArrayBuffer
  useDocument.getState().replaceBase(bytes, doc.pages, useDocument.getState().annotations.filter((a) => a.type !== 'redaction'))
  useDocument.temporal.getState().clear()
  useNotice.getState().show('info', 'Redactions applied. The covered content was removed from the document.')
}
