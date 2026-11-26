import { PDFCheckBox, PDFDropdown, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib'
import type { PDFDocument } from 'pdf-lib'
import { err, ok } from '../../types'
import type { Result } from '../../types'
import { loadPdfLib } from './pageOps'

export type FormFieldInfo =
  | { kind: 'text'; name: string; value: string; readOnly: boolean }
  | { kind: 'checkbox'; name: string; value: boolean; readOnly: boolean }
  | { kind: 'radio' | 'dropdown'; name: string; value: string; options: string[]; readOnly: boolean }

export type FormValues = Readonly<Record<string, string | boolean>>

/** Lists fillable AcroForm fields (text, checkbox, radio, dropdown). Other field types are ignored. */
export async function listFormFields(bytes: ArrayBuffer | Uint8Array): Promise<Result<FormFieldInfo[]>> {
  const loaded = await loadPdfLib(bytes)
  if (!loaded.ok) return loaded
  const out: FormFieldInfo[] = []
  for (const f of loaded.value.getForm().getFields()) {
    const base = { name: f.getName(), readOnly: f.isReadOnly() }
    if (f instanceof PDFTextField) out.push({ ...base, kind: 'text', value: f.getText() ?? '' })
    else if (f instanceof PDFCheckBox) out.push({ ...base, kind: 'checkbox', value: f.isChecked() })
    else if (f instanceof PDFRadioGroup) out.push({ ...base, kind: 'radio', value: f.getSelected() ?? '', options: f.getOptions() })
    else if (f instanceof PDFDropdown) out.push({ ...base, kind: 'dropdown', value: f.getSelected()[0] ?? '', options: f.getOptions() })
    else if (f instanceof PDFOptionList) continue
  }
  return ok(out)
}

/** Applies user-entered values. Fields not mentioned keep their existing values. */
export function applyFormValues(doc: PDFDocument, values: FormValues): Result<void> {
  const form = doc.getForm()
  for (const [name, value] of Object.entries(values)) {
    try {
      const f = form.getField(name)
      if (f instanceof PDFTextField) f.setText(String(value))
      else if (f instanceof PDFCheckBox) {
        if (value) f.check()
        else f.uncheck()
      } else if (f instanceof PDFRadioGroup) {
        if (value) f.select(String(value))
      } else if (f instanceof PDFDropdown) {
        if (value) f.select(String(value))
      }
    } catch {
      return err({ code: 'INTERNAL', message: `Could not fill a form field (${name}). Its value may use characters the PDF font can't encode.` })
    }
  }
  return ok(undefined)
}
