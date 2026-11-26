import { ArrowDownToLine, Crop, FilePlus, FilePlus2, ImagePlus, Ruler, RotateCcw, RotateCw, Scissors, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cropSelected, deletePages, extractBytes, insertBlank, insertImages, insertPdf, resizeSelected, movePages, rotatePages, splitBytes } from '../../lib/pageActions'
import { loadPicture } from '../../lib/annotations/pickImage'
import { PAPER_SIZES } from '../../lib/pdf/pageOps'
import { parsePageRange } from '../../lib/pdf/pageRange'
import { useDocument } from '../../stores/document'
import { useNotice } from '../../stores/notice'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { Modal } from '../common/Modal'
import { Notice } from '../common/Notice'
import { Thumbnail } from '../sidebar/Thumbnail'
import { saveBytes } from '../../lib/exportActions'
import { Select } from '../common/Select'

const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

export function PageManagerDialog() {
  const close = useUI((s) => s.close)
  const doc = useViewer((s) => s.doc)
  const fileName = useViewer((s) => s.fileName)
  const encrypted = useDocument((s) => s.encrypted)
  const pageCount = useDocument((s) => s.pages.length)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [anchor, setAnchor] = useState(0)
  const [range, setRange] = useState('')
  const [dragging, setDragging] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [crop, setCrop] = useState({ top: '', right: '', bottom: '', left: '' })
  const [paper, setPaper] = useState<keyof typeof PAPER_SIZES>('A4')
  const [landscape, setLandscape] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = fileName.replace(/\.pdf$/i, '')
  if (!doc) return null

  const run = async (op: () => Promise<{ ok: boolean; error?: { message: string } }>, after?: () => void) => {
    setBusy(true)
    setError(null)
    const r = await op()
    setBusy(false)
    if (!r.ok) setError(r.error?.message ?? 'The operation failed.')
    else after?.()
  }

  const click = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)]
      setSelected(Array.from({ length: b - a + 1 }, (_, k) => a + k))
    } else if (e.metaKey || e.ctrlKey) {
      setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((x, y) => x - y)))
      setAnchor(i)
    } else {
      setSelected([i])
      setAnchor(i)
    }
  }

  const needSelection = selected.length === 0
  const act = (fn: () => Promise<{ ok: boolean; error?: { message: string } }>, then?: () => void) => () => void run(fn, then)

  const insertFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/pdf,.pdf'
    input.multiple = true
    input.onchange = async () => {
      const files = [...(input.files ?? [])]
      if (!files.length) return
      // Files go in the order chosen, after the selected page (or at the end).
      let at = selected.length ? Math.max(...selected) + 1 : pageCount
      await run(async () => {
        for (const f of files) {
          const r = await insertPdf(await f.arrayBuffer(), at)
          if (!r.ok) return { ok: false, error: { message: `${f.name}: ${r.error.message}` } }
          at += r.value
        }
        return { ok: true }
      }, () => setSelected([]))
    }
    input.click()
  }

  const insertPictures = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif'
    input.multiple = true
    input.onchange = async () => {
      const files = [...(input.files ?? [])]
      if (!files.length) return
      await run(async () => {
        try {
          const images = await Promise.all(files.map(async (f) => {
            const pic = await loadPicture(f)
            const bytes = Uint8Array.from(atob(pic.dataUrl.slice(pic.dataUrl.indexOf(',') + 1)), (c) => c.charCodeAt(0))
            return { mime: pic.mime, bytes: bytes.buffer as ArrayBuffer }
          }))
          return await insertImages(images, selected.length ? Math.max(...selected) + 1 : pageCount)
        } catch {
          return { ok: false, error: { message: 'One of those files could not be read as an image.' } }
        }
      }, () => setSelected([]))
    }
    input.click()
  }

  const rangeIndexes = () => {
    const r = parsePageRange(range, pageCount)
    if (!r.ok) {
      setError(r.error.message)
      return null
    }
    return [...r.value]
  }

  const extract = async (indexes: number[]) => {
    const r = await extractBytes(indexes)
    if (!r.ok) return r
    await saveBytes(buf(r.value), `${base}-pages.pdf`)
    return r
  }

  const split = async () => {
    const idx = rangeIndexes()
    if (!idx) return { ok: true as const }
    // One file per comma-separated part of the range, e.g. "1-3, 5" → two files.
    const groups = range.split(',').map((part) => parsePageRange(part, pageCount)).flatMap((p) => (p.ok ? [[...p.value]] : []))
    const r = await splitBytes(groups)
    if (!r.ok) return r
    for (const [i, bytes] of r.value.entries()) await saveBytes(buf(bytes), `${base}-part${i + 1}.pdf`)
    useNotice.getState().show('info', `Split into ${r.value.length} file${r.value.length === 1 ? '' : 's'}.`)
    return r
  }

  const btn = 'inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-40 pointer-coarse:py-2.5'
  return (
    <Modal title="Organize pages" onClose={close} wide>
      <div className="flex flex-col gap-3">
        {encrypted && <Notice kind="error">Page editing is not supported for encrypted PDFs.</Notice>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn} disabled={busy || encrypted || needSelection} onClick={act(() => rotatePages(selected, 270))}><RotateCcw size={14} aria-hidden /> Rotate left</button>
          <button type="button" className={btn} disabled={busy || encrypted || needSelection} onClick={act(() => rotatePages(selected, 90))}><RotateCw size={14} aria-hidden /> Rotate right</button>
          <button type="button" className={btn} disabled={busy || encrypted || needSelection} onClick={act(() => deletePages(selected), () => setSelected([]))}><Trash2 size={14} aria-hidden /> Delete</button>
          <button type="button" className={btn} disabled={busy || encrypted || needSelection} onClick={act(() => extract(selected))}><ArrowDownToLine size={14} aria-hidden /> Extract selected</button>
          <button type="button" className={btn} disabled={busy || encrypted} onClick={insertFile}><FilePlus2 size={14} aria-hidden /> Combine PDFs…</button>
          <button type="button" className={btn} disabled={busy || encrypted} onClick={act(() => insertBlank(selected.length ? Math.max(...selected) + 1 : pageCount), () => setSelected([]))}><FilePlus size={14} aria-hidden /> Insert blank page</button>
          <button type="button" className={btn} disabled={busy || encrypted} onClick={insertPictures}><ImagePlus size={14} aria-hidden /> Images to pages…</button>
          <button type="button" className={btn} onClick={() => setSelected(Array.from({ length: pageCount }, (_, i) => i))}>Select all</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={range} onChange={(e) => setRange(e.target.value)} placeholder="1-3, 5, 8-10" aria-label="Page range" className="w-full rounded border border-border bg-bg px-2 py-1.5 sm:w-44" />
          <button type="button" className={btn} disabled={busy || encrypted || !range.trim()} onClick={act(async () => { const i = rangeIndexes(); return i ? extract(i) : { ok: true } })}>Extract range</button>
          <button type="button" className={btn} disabled={busy || encrypted || !range.trim()} onClick={act(split)}><Scissors size={14} aria-hidden /> Split by range</button>
          <span className="text-xs text-muted">Split makes one file per comma-separated part.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Crop selected pages (mm):</span>
          {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
            <input key={side} type="number" min={0} step={1} value={crop[side]} onChange={(e) => setCrop({ ...crop, [side]: e.target.value })} placeholder={side} aria-label={`Crop ${side} (mm)`} className="w-16 rounded border border-border bg-bg px-2 py-1.5" />
          ))}
          <button type="button" className={btn} disabled={busy || encrypted || needSelection || !Object.values(crop).some((v) => Number(v) > 0)} onClick={act(() => {
            const mm = (v: string) => Math.max(0, Number(v) || 0) * 2.8346
            return cropSelected(selected, { top: mm(crop.top), right: mm(crop.right), bottom: mm(crop.bottom), left: mm(crop.left) })
          }, () => setCrop({ top: '', right: '', bottom: '', left: '' }))}><Crop size={14} aria-hidden /> Crop</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Paper size of selected pages:</span>
          <Select aria-label="Paper size" value={paper} onChange={(v) => setPaper(v as keyof typeof PAPER_SIZES)} options={Object.keys(PAPER_SIZES).map((k) => ({ value: k }))} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} /> Landscape</label>
          <button type="button" className={btn} disabled={busy || encrypted || needSelection} onClick={act(() => {
            const [w, h] = PAPER_SIZES[paper]
            return resizeSelected(selected, landscape ? h : w, landscape ? w : h)
          })}><Ruler size={14} aria-hidden /> Set size</button>
          <span className="text-xs text-muted">Content is not scaled: it stays at the top-left.</span>
        </div>
        {error && <Notice kind="error" plain>{error}</Notice>}
        <p className="text-xs text-muted">Click to select (Shift or Ctrl/Cmd for several). Drag a page to reorder. Changes apply immediately and can be undone.</p>
        <div ref={setRoot} className="max-h-[50dvh] overflow-y-auto rounded border border-border bg-workspace p-2">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
            {Array.from({ length: pageCount }, (_, i) => (
              <li
                key={i}
                draggable={!encrypted && !busy}
                onDragStart={(e) => { setDragging(i); if (!selected.includes(i)) setSelected([i]); e.dataTransfer.effectAllowed = 'move' }}
                onDragOver={(e) => { if (dragging !== null) { e.preventDefault(); setDropAt(i) } }}
                onDragEnd={() => { setDragging(null); setDropAt(null) }}
                onDrop={(e) => {
                  e.preventDefault()
                  const moving = selected.includes(dragging ?? -1) ? selected : [dragging!]
                  setDragging(null); setDropAt(null)
                  if (moving.length) void run(() => movePages(moving, i), () => setSelected([]))
                }}
                onClick={(e) => click(i, e)}
                className={`rounded ${dropAt === i && dragging !== null ? 'outline outline-2 outline-accent' : ''}`}
              >
                <Thumbnail doc={doc} pageIndex={i} rotation={0} root={root} active={selected.includes(i)} onSelect={() => undefined} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
