import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useDocument } from '../../stores/document'
import { useSignatures } from '../../stores/signatures'
import { useTools } from '../../stores/tools'
import { useUI } from '../../stores/ui'
import { MAX_SAVED_SIGNATURES } from '../../types'
import { Button, DialogActions, inputClass } from '../common/Button'
import { Modal } from '../common/Modal'
import { Notice } from '../common/Notice'

type Method = 'draw' | 'type' | 'upload'
const W = 480
const H = 180
const SCRIPT_FONTS = [
  ['Cursive', 'cursive'],
  ['Brush Script', '"Brush Script MT", "Segoe Script", cursive'],
  ['Snell Roundhand', '"Snell Roundhand", "Apple Chancery", cursive'],
] as const
const MAX_UPLOAD = 2 * 1024 * 1024

/** Crops transparent margins so the placed signature hugs its ink. */
function trim(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = src.getContext('2d')!
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height)
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  }
  if (x1 < 0) return null
  const pad = 6
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1 + pad * 2
  out.height = y1 - y0 + 1 + pad * 2
  out.getContext('2d')!.drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, pad, pad, x1 - x0 + 1, y1 - y0 + 1)
  return out
}

const toPng = (c: HTMLCanvasElement) => new Promise<ArrayBuffer>((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then(res) : rej(new Error('encode failed'))), 'image/png'))

export function SignatureDialog() {
  const close = useUI((s) => s.close)
  const { items, add, remove } = useSignatures()
  const annotations = useDocument((s) => s.annotations)
  const [method, setMethod] = useState<Method>('draw')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [font, setFont] = useState<string>(SCRIPT_FONTS[0][1])
  const [size, setSize] = useState(64)
  const [color, setColor] = useState('#111827')
  const [upload, setUpload] = useState<{ bytes: ArrayBuffer; mime: 'image/png' | 'image/jpeg'; url: string } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef<{ last: { x: number; y: number }; mid: { x: number; y: number } } | null>(null)
  const full = items.length >= MAX_SAVED_SIGNATURES

  useEffect(() => () => { if (upload) URL.revokeObjectURL(upload.url) }, [upload])

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }
  const ctx2d = () => {
    const c = canvas.current!.getContext('2d')!
    c.lineWidth = 2.5
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.strokeStyle = color
    return c
  }

  const finish = async (bytes: ArrayBuffer, mime: 'image/png' | 'image/jpeg') => {
    const err = await add(`Signature ${items.length + 1}`, mime, bytes)
    if (err) return setError(err.message)
    const added = useSignatures.getState().items.at(-1)
    if (added) useTools.getState().set({ signatureId: added.id, tool: 'signature', selectedId: null })
    close()
  }

  const save = async () => {
    setError(null)
    try {
      if (method === 'upload') {
        if (!upload) return setError('Choose a PNG or JPG image first.')
        return await finish(upload.bytes, upload.mime)
      }
      let src = canvas.current!
      if (method === 'type') {
        if (!text.trim()) return setError('Type your name first.')
        src = document.createElement('canvas')
        const probe = src.getContext('2d')!
        probe.font = `${size}px ${font}`
        src.width = Math.ceil(probe.measureText(text).width) + 40
        src.height = size * 2
        const c = src.getContext('2d')!
        c.font = `${size}px ${font}`
        c.fillStyle = color
        c.textBaseline = 'middle'
        c.fillText(text, 20, size)
      }
      const trimmed = trim(src)
      if (!trimmed) return setError('Draw your signature first.')
      await finish(await toPng(trimmed), 'image/png')
    } catch {
      setError('Could not create the signature image.')
    }
  }

  const onFile = async (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (f.type !== 'image/png' && f.type !== 'image/jpeg') return setError('Only PNG and JPG images are supported.')
    if (f.size > MAX_UPLOAD) return setError('That image is larger than 2 MB.')
    setUpload({ bytes: await f.arrayBuffer(), mime: f.type, url: URL.createObjectURL(f) })
  }

  const used = (id: string) => annotations.some((a) => a.type === 'signature' && a.signatureId === id)

  return (
    <Modal title="Signature" onClose={close}>
      <div className="flex flex-col gap-3">
        {items.length > 0 && (
          <section aria-label="Saved signatures">
            <h3 className="mb-1 text-xs font-medium text-muted">Saved on this device ({items.length}/{MAX_SAVED_SIGNATURES})</h3>
            <ul className="flex flex-wrap gap-2">
              {items.map((s) => (
                <li key={s.id} className="flex items-center gap-1 rounded border border-border p-1">
                  <button type="button" title="Use this signature" onClick={() => { useTools.getState().set({ signatureId: s.id, tool: 'signature', selectedId: null }); close() }} className="rounded bg-white p-1">
                    <img src={s.url} alt={s.label} className="h-10 max-w-32 object-contain" />
                  </button>
                  <button type="button" aria-label={`Delete ${s.label}`} disabled={used(s.id)} title={used(s.id) ? 'Remove it from the pages first' : 'Delete'} onClick={() => void remove(s.id)} className="rounded p-1 hover:bg-surface-2 disabled:opacity-40">
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div role="tablist" className="flex gap-1 border-b border-border">
          {(['draw', 'type', 'upload'] as const).map((m) => (
            <button key={m} role="tab" type="button" aria-selected={method === m} onClick={() => setMethod(m)} className={`px-3 py-1.5 capitalize ${method === m ? 'border-b-2 border-accent font-medium' : 'text-muted'}`}>{m}</button>
          ))}
        </div>
        {method === 'draw' && (
          <div className="flex flex-col gap-2">
            <canvas
              ref={canvas} width={W} height={H} aria-label="Signature drawing area"
              className="w-full touch-none rounded border border-dashed border-border bg-white"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = pos(e); drawing.current = { last: p, mid: p } }}
              onPointerMove={(e) => {
                if (!drawing.current) return
                const p = pos(e)
                const c = ctx2d()
                // Smooth strokes: curve from the previous midpoint to the new one, using the previous point as control.
                const { last, mid } = drawing.current
                const next = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 }
                c.beginPath(); c.moveTo(mid.x, mid.y); c.quadraticCurveTo(last.x, last.y, next.x, next.y); c.stroke()
                drawing.current = { last: p, mid: next }
              }}
              onPointerUp={() => (drawing.current = null)}
              onPointerCancel={() => (drawing.current = null)}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-muted">Ink <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
              <button type="button" onClick={() => canvas.current!.getContext('2d')!.clearRect(0, 0, W, H)} className="rounded px-2 py-1 hover:bg-surface-2">Clear</button>
            </div>
          </div>
        )}
        {method === 'type' && (
          <div className="flex flex-col gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Your name" aria-label="Typed signature" className="rounded border border-border bg-bg px-3 py-2" />
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <select value={font} onChange={(e) => setFont(e.target.value)} aria-label="Signature font" className={`${inputClass} text-text`}>{SCRIPT_FONTS.map(([n, f]) => <option key={n} value={f}>{n}</option>)}</select>
              <label className="flex items-center gap-1">Size <input type="range" min={32} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} /></label>
              <label className="flex items-center gap-1">Ink <input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
            </div>
            <div className="grid h-24 place-items-center overflow-hidden rounded border border-border bg-white" style={{ font: `${Math.min(size, 70)}px ${font}`, color }}>{text || <span className="text-sm text-gray-400" style={{ font: 'inherit', fontSize: 14 }}>Preview</span>}</div>
          </div>
        )}
        {method === 'upload' && (
          <div className="flex flex-col gap-2">
            <input type="file" accept="image/png,image/jpeg" aria-label="Signature image" onChange={(e) => void onFile(e.target.files?.[0])} />
            {upload && <img src={upload.url} alt="Selected signature" className="max-h-32 self-start rounded border border-border bg-white object-contain" />}
            <p className="text-xs text-muted">PNG with a transparent background works best. Max 2 MB.</p>
          </div>
        )}
        {full && <p className="text-xs text-muted">The vault is full. Delete a saved signature to add another.</p>}
        {error && <Notice kind="error" plain>{error}</Notice>}
        <DialogActions>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={full} onClick={() => void save()}>Save and place</Button>
        </DialogActions>
      </div>
    </Modal>
  )
}
