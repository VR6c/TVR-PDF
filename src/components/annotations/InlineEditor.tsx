import { useEffect, useRef } from 'react'
import { useDocument } from '../../stores/document'
import { useTools } from '../../stores/tools'
import type { Annotation, AnnotationId, PageRect } from '../../types'

interface Props {
  annotation: Extract<Annotation, { type: 'text' | 'textedit' | 'note' }>
  /** Viewport-space rectangle of the annotation. */
  rect: PageRect
  scale: number
}

/**
 * Plain textarea over the page for editing text boxes, notes and replaced page text.
 * Empty text removes a text box or note; for replaced page text, unchanged text cancels the edit and empty text blanks the line.
 */
export function InlineEditor({ annotation, rect, scale }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  // Focus after the pointer gesture that created this editor has finished: the browser's default
  // mousedown action would otherwise blur it immediately and discard the new annotation.
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30)
    return () => clearTimeout(t)
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const { update, remove } = useDocument.getState()
    const text = ref.current?.value ?? ''
    if (annotation.type === 'textedit') {
      if (commit && text !== annotation.originalText) update(annotation.id, { text })
      else if (annotation.text === annotation.originalText) remove(annotation.id as AnnotationId)
    } else if (commit && text.trim()) update(annotation.id, { text })
    else if (!annotation.text.trim()) remove(annotation.id as AnnotationId)
    useTools.getState().set({ editingId: null })
  }

  const isText = annotation.type === 'text' || annotation.type === 'textedit'
  return (
    <textarea
      ref={ref}
      aria-label={annotation.type === 'textedit' ? 'Replacement text' : isText ? 'Text box content' : 'Note content'}
      defaultValue={annotation.text}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') finish(false)
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) finish(true)
      }}
      className="absolute z-10 resize rounded border-2 border-accent bg-white/90 p-1 text-black outline-none"
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(rect.width, annotation.type === 'textedit' ? 80 : 160),
        minHeight: Math.max(rect.height, annotation.type === 'textedit' ? 0 : 60),
        fontSize: isText ? annotation.style.fontSize * scale : 14,
        fontFamily: isText ? annotation.style.fontFamily : 'inherit',
        textAlign: isText ? annotation.style.align : 'left',
        color: isText ? annotation.style.color : '#000',
      }}
    />
  )
}
