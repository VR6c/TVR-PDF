import { create } from 'zustand'
import type { FormFieldType, AnnotationId, SignatureId, StampKind, TextStyle } from '../types'

export type Tool =
  | 'select' | 'hand' | 'highlight' | 'underline' | 'strikethrough' | 'freehand' | 'text' | 'edittext' | 'note'
  | 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'stamp' | 'signature' | 'image' | 'link' | 'field' | 'redact' | 'eraser'

/** Tools whose pointer events belong to the Konva layer. The rest leave the text layer selectable. */
export const CANVAS_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
  'select', 'freehand', 'text', 'note', 'rectangle', 'ellipse', 'line', 'arrow', 'stamp', 'signature', 'image', 'link', 'field', 'redact', 'eraser',
])
export const MARKUP_TOOLS: ReadonlySet<Tool> = new Set<Tool>(['highlight', 'underline', 'strikethrough'])

interface ToolState {
  tool: Tool
  color: string
  opacity: number
  strokeWidth: number
  fontSize: number
  fontFamily: string
  align: TextStyle['align']
  fillShapes: boolean
  stamp: StampKind
  signatureId: SignatureId | null
  /** Picture waiting to be placed by the next click on a page (Image tool). */
  fieldType: FormFieldType
  pendingImage: { mime: 'image/png' | 'image/jpeg'; dataUrl: string; aspect: number } | null
  selectedId: AnnotationId | null
  /** Annotation whose text is being edited inline. */
  editingId: AnnotationId | null
  setTool: (t: Tool) => void
  set: (p: Partial<Omit<ToolState, 'setTool' | 'set'>>) => void
}

export const useTools = create<ToolState>((set, get) => ({
  tool: 'select',
  color: '#e11d48',
  opacity: 1,
  strokeWidth: 2,
  fontSize: 16,
  fontFamily: 'Helvetica',
  align: 'left',
  fillShapes: false,
  stamp: 'APPROVED',
  signatureId: null,
  fieldType: 'text',
  pendingImage: null,
  selectedId: null,
  editingId: null,
  setTool: (tool) => {
    const was = get().tool
    const patch: Partial<ToolState> = { tool, selectedId: null, editingId: null }
    if (tool === 'highlight' && !MARKUP_TOOLS.has(was)) Object.assign(patch, { color: '#facc15', opacity: 0.4 })
    else if (MARKUP_TOOLS.has(was) && !MARKUP_TOOLS.has(tool)) Object.assign(patch, { color: '#e11d48', opacity: 1 })
    set(patch)
  },
  set: (p) => set(p),
}))
