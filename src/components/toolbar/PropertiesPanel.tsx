import { Trash2, X } from 'lucide-react'
import { stylePatch } from '../../lib/annotations/style'
import { STAMP_KINDS } from '../../lib/annotations/stamps'
import type { StyleChange } from '../../lib/annotations/style'
import { applyRedactionMarks } from '../../lib/redactionFlow'
import { useDocument } from '../../stores/document'
import { isSafeUrl } from '../../lib/annotations/io'
import { useSignatures } from '../../stores/signatures'
import { useTools } from '../../stores/tools'
import { useViewer } from '../../stores/viewer'
import { useUI } from '../../stores/ui'
import type { Annotation } from '../../types'
import { inputClass } from '../common/Button'
import { Select } from '../common/Select'

const SWATCHES = ['#e11d48', '#f97316', '#facc15', '#22c55e', '#2563eb', '#7c3aed', '#111827']
const FONTS = ['Helvetica', 'Times New Roman', 'Courier New']

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="flex flex-col gap-1 text-xs text-muted">
    {label}
    {children}
  </label>
)

function currentStyle(a: Annotation | undefined) {
  if (!a) return null
  switch (a.type) {
    case 'highlight': case 'underline': case 'strikethrough': return { color: a.color, opacity: a.opacity }
    case 'freehand': case 'line': case 'arrow': return { color: a.style.color, opacity: a.style.opacity, strokeWidth: a.style.width }
    case 'rectangle': case 'ellipse': return { color: a.stroke.color, opacity: a.stroke.opacity, strokeWidth: a.stroke.width }
    case 'text': case 'textedit': return { color: a.style.color, fontSize: a.style.fontSize, fontFamily: a.style.fontFamily, align: a.style.align }
    case 'note': return { color: a.color }
    default: return null
  }
}

export function PropertiesPanel() {
  const t = useTools()
  const annotations = useDocument((s) => s.annotations)
  const pageCount = useViewer((s) => s.doc?.numPages ?? 0)
  const pages = useDocument((s) => s.pages)
  const sigs = useSignatures((s) => s.items)
  const propsOpen = useUI((s) => s.propsOpen)
  const toggleProps = useUI((s) => s.toggleProps)
  const selected = annotations.find((a) => a.id === t.selectedId)
  const marks = annotations.filter((a) => a.type === 'redaction').length
  const cur = currentStyle(selected)
  const type = selected?.type ?? t.tool

  const change = (c: StyleChange) => {
    t.set({
      ...(c.color !== undefined && { color: c.color }),
      ...(c.opacity !== undefined && { opacity: c.opacity }),
      ...(c.strokeWidth !== undefined && { strokeWidth: c.strokeWidth }),
      ...(c.fontSize !== undefined && { fontSize: c.fontSize }),
      ...(c.fontFamily !== undefined && { fontFamily: c.fontFamily }),
      ...(c.align !== undefined && { align: c.align }),
    })
    if (selected) {
      const p = stylePatch(selected, c)
      if (p) useDocument.getState().update(selected.id, p)
    }
  }
  const v = {
    color: cur?.color ?? t.color,
    opacity: (cur && 'opacity' in cur ? cur.opacity : undefined) ?? t.opacity,
    strokeWidth: (cur && 'strokeWidth' in cur ? cur.strokeWidth : undefined) ?? t.strokeWidth,
    fontSize: (cur && 'fontSize' in cur ? cur.fontSize : undefined) ?? t.fontSize,
    fontFamily: (cur && 'fontFamily' in cur ? cur.fontFamily : undefined) ?? t.fontFamily,
    align: (cur && 'align' in cur ? cur.align : undefined) ?? t.align,
  }

  const hasColor = ['highlight', 'underline', 'strikethrough', 'freehand', 'line', 'arrow', 'rectangle', 'ellipse', 'text', 'textedit', 'note'].includes(type)
  const hasOpacity = ['highlight', 'underline', 'strikethrough', 'freehand', 'line', 'arrow', 'rectangle', 'ellipse'].includes(type)
  const hasWidth = ['freehand', 'line', 'arrow', 'rectangle', 'ellipse'].includes(type)
  const hasText = type === 'text' || type === 'textedit'
  const nothing = type !== 'link' && type !== 'field' && !hasColor && type !== 'stamp' && type !== 'signature' && type !== 'redact' && type !== 'redaction' && !selected

  return (
    <aside
      aria-label="Properties"
      className={`flex shrink-0 flex-col gap-3 overflow-y-auto border-border bg-surface p-3 lg:w-56 lg:border-l ${
        propsOpen ? 'max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-10 max-lg:max-h-[55%] max-lg:rounded-t-xl max-lg:border-t max-lg:shadow-[0_-8px_24px_rgb(0_0_0/0.12)]' : 'max-lg:hidden'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold capitalize">{selected ? `Selected: ${selected.type}` : `Tool: ${t.tool}`}</h2>
        <button type="button" aria-label="Close properties" onClick={toggleProps} className="-mr-1 inline-flex size-8 items-center justify-center rounded-md hover:bg-surface-2 lg:hidden pointer-coarse:size-10">
          <X size={18} aria-hidden />
        </button>
      </div>
      {t.tool === 'edittext' && !selected && <p className="text-xs text-muted">Click a line of text on the page, type the replacement, then press Ctrl/⌘+Enter or click away. The original is covered, not deleted; use redaction if it must be removed from the file.</p>}
      {nothing && t.tool !== 'edittext' && <p className="text-xs text-muted">Pick a drawing tool or select an annotation to edit its properties.</p>}
      {hasColor && (
        <Row label="Color">
          <div className="flex flex-wrap items-center gap-1">
            {SWATCHES.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => change({ color: c })} className={`size-6 rounded-full border pointer-coarse:size-8 ${v.color === c ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-border'}`} style={{ background: c }} />
            ))}
            <input type="color" aria-label="Custom color" value={v.color} onChange={(e) => change({ color: e.target.value })} className="size-7 cursor-pointer bg-transparent pointer-coarse:size-9" />
          </div>
        </Row>
      )}
      {hasOpacity && (
        <Row label={`Opacity ${Math.round(v.opacity * 100)}%`}>
          <input type="range" className="h-6 accent-accent" min={0.1} max={1} step={0.05} value={v.opacity} onChange={(e) => change({ opacity: Number(e.target.value) })} />
        </Row>
      )}
      {hasWidth && (
        <Row label={`Thickness ${v.strokeWidth}`}>
          <input type="range" className="h-6 accent-accent" min={1} max={20} step={1} value={v.strokeWidth} onChange={(e) => change({ strokeWidth: Number(e.target.value) })} />
        </Row>
      )}
      {(type === 'rectangle' || type === 'ellipse') && !selected && (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={t.fillShapes} onChange={(e) => t.set({ fillShapes: e.target.checked })} /> Fill shapes
        </label>
      )}
      {hasText && (
        <>
          <Row label="Font size">
            <input type="number" min={6} max={96} value={v.fontSize} onChange={(e) => change({ fontSize: Math.min(96, Math.max(6, Number(e.target.value) || 16)) })} className={`${inputClass} text-text`} />
          </Row>
          <Row label="Font">
            <Select aria-label="Font" value={v.fontFamily} onChange={(fontFamily) => change({ fontFamily })} options={FONTS.map((f) => ({ value: f }))} />
          </Row>
          <Row label="Alignment">
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} type="button" aria-pressed={v.align === a} onClick={() => change({ align: a })} className={`flex-1 rounded border border-border px-1 py-1 capitalize pointer-coarse:py-2 ${v.align === a ? 'border-accent bg-accent-soft text-accent' : ''}`}>{a}</button>
              ))}
            </div>
          </Row>
        </>
      )}
      {type === 'stamp' && !selected && (
        <Row label="Stamp">
          <Select aria-label="Stamp" value={t.stamp} onChange={(stamp) => t.set({ stamp: stamp as typeof t.stamp })} options={STAMP_KINDS.map((k) => ({ value: k }))} />
        </Row>
      )}
      {t.tool === 'link' && !selected && <p className="text-xs text-muted">Drag an area on the page, then set where it goes. Links work in the exported PDF.</p>}
      {selected?.type === 'link' && (
        <>
          <Row label="Web or email address">
            <input aria-label="Link address" placeholder="https://… or mailto:…" value={selected.url} onChange={(e) => useDocument.getState().update(selected.id, { url: e.target.value, targetPageId: null })} className={`${inputClass} text-text`} />
          </Row>
          {selected.url && !isSafeUrl(selected.url) && <p role="alert" className="text-xs text-red-600">Only http(s):// and mailto: addresses are allowed.</p>}
          <Row label="…or jump to page">
            <Select
              aria-label="Link target page"
              value={selected.targetPageId ?? ''}
              onChange={(v) => useDocument.getState().update(selected.id, { targetPageId: (v || null) as typeof selected.targetPageId, url: '' })}
              options={[{ value: '', label: 'None' }, ...pages.map((p, i) => ({ value: p.pageId, label: `Page ${i + 1}` }))]}
            />
          </Row>
        </>
      )}
      {(t.tool === 'field' || selected?.type === 'field') && (
        <>
          {!selected && <p className="text-xs text-muted">Drag an area on the page to add a fillable field. It becomes a real form field when you export.</p>}
          {!selected && (
            <Row label="Field type">
              <Select
                aria-label="Field type"
                value={t.fieldType}
                onChange={(fieldType) => t.set({ fieldType: fieldType as typeof t.fieldType })}
                options={[{ value: 'text', label: 'Text' }, { value: 'checkbox', label: 'Checkbox' }, { value: 'dropdown', label: 'Dropdown' }]}
              />
            </Row>
          )}
          {selected?.type === 'field' && (
            <>
              <Row label={`Field name (${selected.fieldType})`}>
                <input aria-label="Field name" value={selected.name} onChange={(e) => useDocument.getState().update(selected.id, { name: e.target.value })} className={`${inputClass} text-text`} />
              </Row>
              {selected.fieldType === 'dropdown' && (
                <Row label="Choices (one per line)">
                  <textarea aria-label="Dropdown choices" rows={4} value={selected.options.join('\n')} onChange={(e) => useDocument.getState().update(selected.id, { options: e.target.value.split('\n') })} className={`${inputClass} text-text`} />
                </Row>
              )}
            </>
          )}
        </>
      )}
      {t.tool === 'signature' && (
        <Row label="Signature to place">
          <Select
            aria-label="Signature"
            value={t.signatureId ?? ''}
            onChange={(v) => t.set({ signatureId: (v || null) as typeof t.signatureId })}
            options={[{ value: '', label: 'Choose…' }, ...sigs.map((s) => ({ value: s.id, label: s.label }))]}
          />
        </Row>
      )}
      {(t.tool === 'redact' || selected?.type === 'redaction' || marks > 0) && (
        <div className="flex flex-col gap-2 rounded border border-border p-2 text-xs">
          <p className="text-muted">
            Marks are not redaction yet. Applying rebuilds those pages as images with the areas blacked out, which removes the text beneath them for good (the page becomes non-searchable).
          </p>
          <button type="button" disabled={!marks} onClick={() => void applyRedactionMarks()} className="rounded bg-danger px-2 py-2 font-medium text-accent-text disabled:opacity-40 pointer-coarse:py-3">
            Apply {marks} redaction{marks === 1 ? '' : 's'}…
          </button>
        </div>
      )}
      {selected && (
        <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
          {selected.type !== 'highlight' && (
            <Row label="Move to page">
              <Select
                aria-label="Move to page"
                value={String(pages.findIndex((p) => p.pageId === selected.pageId) + 1)}
                onChange={(v) => {
                  const target = pages[Number(v) - 1]
                  if (target && target.pageId !== selected.pageId) useDocument.getState().moveToPage(selected.id, target.pageId, { x: 40, y: 40 })
                }}
                options={Array.from({ length: pageCount }, (_, i) => ({ value: String(i + 1), label: `Page ${i + 1}` }))}
              />
            </Row>
          )}
          <button
            type="button"
            onClick={() => {
              useDocument.getState().remove(selected.id)
              t.set({ selectedId: null })
            }}
            className="flex items-center justify-center gap-1 rounded border border-border px-2 py-1.5 hover:bg-surface-2 pointer-coarse:py-3"
          >
            <Trash2 size={14} aria-hidden /> Delete
          </button>
        </div>
      )}
    </aside>
  )
}
