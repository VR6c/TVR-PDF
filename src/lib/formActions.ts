import { callWorker } from './pdf/workerClient'
import type { FormFieldInfo, FormValues } from './pdf/forms'
import { useDocument } from '../stores/document'
import { err } from '../types'

export const listFormFieldsInWorker = (bytes: ArrayBuffer) => callWorker<FormFieldInfo[]>('forms', { bytes })

/** Writes values (with regenerated appearances) into the working PDF as one undo step. */
export async function fillFormInWorker(values: FormValues) {
  const { baseBytes, pages } = useDocument.getState()
  if (!baseBytes) return err({ code: 'INTERNAL', message: 'No document is open.' })
  const r = await callWorker<Uint8Array>('fill', { bytes: baseBytes, values })
  if (!r.ok) return r
  const bytes = r.value.buffer.slice(r.value.byteOffset, r.value.byteOffset + r.value.byteLength) as ArrayBuffer
  useDocument.getState().replaceBase(bytes, pages)
  return r
}
