import type Konva from 'konva'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Arrow, Ellipse, Group, Image as KImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import { createPageTransform, konvaGroupProps, viewportSize } from '../../lib/geometry/transform'
import { stampFontSize, textEditOrigin } from '../../lib/annotations/style'
import { STAMP_COLORS } from '../../lib/annotations/stamps'
import { useDocument } from '../../stores/document'
import { useSignatures } from '../../stores/signatures'
import { CANVAS_TOOLS, useTools } from '../../stores/tools'
import type { Annotation, NewAnnotation, PageId, PagePoint, PageSize, Rotation, SignatureId } from '../../types'
import { InlineEditor } from './InlineEditor'

interface Props {
  pageId: PageId
  pageSize: PageSize
  rotation: Rotation
  scale: number
}

type Draft =
  | { tool: 'freehand'; points: PagePoint[] }
  | { tool: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'redact' | 'link' | 'field'; start: PagePoint; end: PagePoint }

const TRANSFORMABLE = new Set<Annotation['type']>(['rectangle', 'ellipse', 'text', 'stamp', 'signature', 'image', 'link', 'field', 'redaction'])
const SELECT_GLOW = { shadowColor: '#2563eb', shadowBlur: 8, shadowOpacity: 0.9 }

const normRect = (a: PagePoint, b: PagePoint) => ({
  x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y),
})
const dist = (a: PagePoint, b: PagePoint) => Math.hypot(a.x - b.x, a.y - b.y)

function SignatureImage({ id, width, height }: { id: SignatureId; width: number; height: number }) {
  const sig = useSignatures((s) => s.items.find((i) => i.id === id))
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!sig) return
    const el = new window.Image()
    el.onload = () => setImg(el)
    el.src = sig.url
  }, [sig])
  return img ? <KImage image={img} width={width} height={height} /> : <Rect width={width} height={height} stroke="#999" dash={[4, 4]} />
}

function PictureImage({ dataUrl, width, height }: { dataUrl: string; width: number; height: number }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    const el = new window.Image()
    el.onload = () => setImg(el)
    el.src = dataUrl
  }, [dataUrl])
  return img ? <KImage image={img} width={width} height={height} /> : <Rect width={width} height={height} stroke="#999" dash={[4, 4]} />
}

export function AnnotationLayer({ pageId, pageSize, rotation, scale }: Props) {
  const all = useDocument((s) => s.annotations)
  const { update, add, remove } = useDocument.getState()
  const tools = useTools()
  const { tool, selectedId, editingId } = tools
  const [draft, setDraft] = useState<Draft | null>(null)
  const groupRef = useRef<Konva.Group>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const trRef = useRef<Konva.Transformer>(null)

  const vp = { pageSize, rotation, scale }
  const size = viewportSize(vp)
  const anns = useMemo(() => all.filter((a) => a.pageId === pageId).sort((a, b) => a.zIndex - b.zIndex), [all, pageId])
  const active = CANVAS_TOOLS.has(tool)
  const selectable = tool === 'select'
  const selected = anns.find((a) => a.id === selectedId)

  useEffect(() => {
    const tr = trRef.current
    const node = selected && TRANSFORMABLE.has(selected.type) ? layerRef.current?.findOne((n: Konva.Node) => n.id() === selected.id) : null
    tr?.nodes(node ? [node] : [])
    tr?.getLayer()?.batchDraw()
  }, [selected, anns, scale])

  const pointer = (): PagePoint | null => groupRef.current?.getRelativePointerPosition() ?? null

  const create = (a: NewAnnotation, edit = false) => {
    const id = add(a)
    tools.set({ selectedId: id, editingId: edit ? id : null })
  }

  const onDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    const p = pointer()
    if (!p) return
    if (tool === 'select') {
      if (e.target === e.target.getStage()) tools.set({ selectedId: null })
      return
    }
    switch (tool) {
      case 'freehand': setDraft({ tool, points: [p] }); break
      case 'rectangle': case 'ellipse': case 'line': case 'arrow': case 'redact': case 'link': case 'field': setDraft({ tool, start: p, end: p }); break
      case 'text':
        create({ type: 'text', pageId, bounds: { x: p.x, y: p.y, width: 180, height: tools.fontSize * 2 }, rotation: 0, text: '', style: { color: tools.color, fontFamily: tools.fontFamily, fontSize: tools.fontSize, align: tools.align } }, true)
        break
      case 'note': create({ type: 'note', pageId, position: p, text: '', color: '#facc15' }, true); break
      case 'stamp': create({ type: 'stamp', pageId, stamp: tools.stamp, bounds: { x: p.x - 80, y: p.y - 24, width: 160, height: 48 }, rotation: 0 }); break
      case 'image': {
        const pic = tools.pendingImage
        if (!pic) return
        const w = Math.min(240, pageSize.width * 0.5)
        const h = w / pic.aspect
        create({ type: 'image', pageId, mime: pic.mime, dataUrl: pic.dataUrl, bounds: { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h }, rotation: 0 })
        tools.set({ tool: 'select', pendingImage: null })
        break
      }
      case 'signature': {
        const sig = tools.signatureId ? useSignatures.getState().byId(tools.signatureId) : undefined
        if (!sig) return
        const w = 160
        const h = w / sig.aspect
        create({ type: 'signature', pageId, signatureId: sig.id, bounds: { x: p.x - w / 2, y: p.y - h / 2, width: w, height: h }, rotation: 0 })
        tools.set({ tool: 'select' }) // keep the new signature selected
        break
      }
    }
  }

  const onMove = () => {
    const p = pointer()
    if (!draft || !p) return
    if (draft.tool === 'freehand') {
      const last = draft.points[draft.points.length - 1]
      if (dist(last, p) >= 0.75) setDraft({ ...draft, points: [...draft.points, p] })
    } else setDraft({ ...draft, end: p })
  }

  const onUp = () => {
    if (!draft) return
    setDraft(null)
    const { color, opacity, strokeWidth, fillShapes } = tools
    const stroke = { color, opacity, width: strokeWidth }
    if (draft.tool === 'freehand') {
      add({ type: 'freehand', pageId, points: draft.points, style: stroke })
      return
    }
    if (dist(draft.start, draft.end) < 3) return
    const bounds = normRect(draft.start, draft.end)
    if (draft.tool === 'rectangle') add({ type: 'rectangle', pageId, bounds, rotation: 0, stroke, fill: fillShapes ? { color, opacity: Math.min(opacity, 0.35) } : null })
    else if (draft.tool === 'ellipse') add({ type: 'ellipse', pageId, bounds, rotation: 0, stroke, fill: fillShapes ? { color, opacity: Math.min(opacity, 0.35) } : null })
    else if (draft.tool === 'redact') add({ type: 'redaction', pageId, bounds })
    else if (draft.tool === 'link') {
      create({ type: 'link', pageId, bounds, url: '', targetPageId: null })
      tools.set({ tool: 'select' })
    } else if (draft.tool === 'field') {
      const t = tools.fieldType
      const taken = new Set(useDocument.getState().annotations.flatMap((a) => (a.type === 'field' ? [a.name] : [])))
      let n = 1
      while (taken.has(`${t}${n}`)) n++
      const b = t === 'checkbox' ? { x: bounds.x, y: bounds.y, width: Math.max(14, Math.min(bounds.width, bounds.height)), height: Math.max(14, Math.min(bounds.width, bounds.height)) } : bounds
      create({ type: 'field', pageId, fieldType: t, name: `${t}${n}`, bounds: b, options: t === 'dropdown' ? ['Option 1', 'Option 2'] : [] })
      tools.set({ tool: 'select' })
    }
    else add({ type: draft.tool, pageId, start: draft.start, end: draft.end, style: stroke })
  }

  const hit = (a: Annotation) => ({
    id: a.id,
    onClick: () => (tool === 'eraser' ? remove(a.id) : selectable && tools.set({ selectedId: a.id })),
    onTap: () => (tool === 'eraser' ? remove(a.id) : selectable && tools.set({ selectedId: a.id })),
  })
  const glow = (a: Annotation) => (a.id === selectedId ? SELECT_GLOW : {})
  const draggable = selectable

  const bounded = (a: Extract<Annotation, { bounds: unknown }>, children: React.ReactNode, editable = false) => (
    <Group
      key={a.id}
      {...hit(a)}
      x={a.bounds.x}
      y={a.bounds.y}
      rotation={'rotation' in a ? a.rotation : 0}
      draggable={draggable}
      onDblClick={() => editable && selectable && tools.set({ editingId: a.id })}
      onDblTap={() => editable && selectable && tools.set({ editingId: a.id })}
      onDragEnd={(e) => update(a.id, { bounds: { ...a.bounds, x: e.target.x(), y: e.target.y() } })}
      onTransformEnd={(e) => {
        const n = e.target
        const sx = n.scaleX()
        const sy = n.scaleY()
        n.scaleX(1)
        n.scaleY(1)
        update(a.id, {
          bounds: { x: n.x(), y: n.y(), width: Math.max(8, a.bounds.width * sx), height: Math.max(8, a.bounds.height * sy) },
          ...('rotation' in a ? { rotation: ((n.rotation() % 360) + 360) % 360 } : {}),
        })
      }}
    >
      {children}
    </Group>
  )

  /** Lines, strokes and notes move by offsetting all points; the node snaps back to the origin. */
  const moveBy = (e: Konva.KonvaEventObject<DragEvent>, apply: (dx: number, dy: number) => void) => {
    const dx = e.target.x()
    const dy = e.target.y()
    e.target.position({ x: 0, y: 0 })
    if (dx || dy) apply(dx, dy)
  }
  const shift = (p: PagePoint, dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy })

  const render = (a: Annotation) => {
    switch (a.type) {
      case 'highlight':
        return (
          <Group key={a.id} {...hit(a)} {...glow(a)}>
            {a.quads.map((q, i) => <Rect key={i} {...q} fill={a.color} opacity={a.opacity} globalCompositeOperation="multiply" />)}
          </Group>
        )
      case 'underline':
      case 'strikethrough':
        return (
          <Group key={a.id} {...hit(a)} {...glow(a)}>
            {a.quads.map((q, i) => {
              const y = a.type === 'underline' ? q.y + q.height : q.y + q.height / 2
              return <Line key={i} points={[q.x, y, q.x + q.width, y]} stroke={a.color} opacity={a.opacity} strokeWidth={Math.max(1, q.height / 12)} hitStrokeWidth={Math.max(8, q.height)} />
            })}
          </Group>
        )
      case 'freehand':
        return (
          <Line key={a.id} {...hit(a)} {...glow(a)} points={a.points.flatMap((p) => [p.x, p.y])} stroke={a.style.color} strokeWidth={a.style.width} opacity={a.style.opacity}
            lineCap="round" lineJoin="round" tension={0.3} hitStrokeWidth={Math.max(10, a.style.width)} draggable={draggable}
            onDragEnd={(e) => moveBy(e, (dx, dy) => update(a.id, { points: a.points.map((p) => shift(p, dx, dy)) }))} />
        )
      case 'line':
      case 'arrow': {
        const Cmp = a.type === 'arrow' ? Arrow : Line
        return (
          <Cmp key={a.id} {...hit(a)} {...glow(a)} points={[a.start.x, a.start.y, a.end.x, a.end.y]} stroke={a.style.color} fill={a.style.color}
            strokeWidth={a.style.width} opacity={a.style.opacity} lineCap="round" pointerLength={Math.max(8, a.style.width * 4)}
            pointerWidth={Math.max(8, a.style.width * 4)} hitStrokeWidth={Math.max(10, a.style.width)} draggable={draggable}
            onDragEnd={(e: Konva.KonvaEventObject<DragEvent>) => moveBy(e, (dx, dy) => update(a.id, { start: shift(a.start, dx, dy), end: shift(a.end, dx, dy) }))} />
        )
      }
      case 'rectangle':
        return bounded(a, <Rect width={a.bounds.width} height={a.bounds.height} stroke={a.stroke.color} strokeWidth={a.stroke.width} opacity={a.stroke.opacity} fill={a.fill?.color} fillEnabled={!!a.fill} />)
      case 'ellipse':
        return bounded(a, <Ellipse x={a.bounds.width / 2} y={a.bounds.height / 2} radiusX={a.bounds.width / 2} radiusY={a.bounds.height / 2} stroke={a.stroke.color} strokeWidth={a.stroke.width} opacity={a.stroke.opacity} fill={a.fill?.color} fillEnabled={!!a.fill} />)
      case 'text':
        return bounded(a, <>
          <Rect width={a.bounds.width} height={a.bounds.height} fill="rgba(0,0,0,0.001)" />
          <Text width={a.bounds.width} height={a.bounds.height} text={a.text} fontSize={a.style.fontSize} fontFamily={a.style.fontFamily} fill={a.style.color} align={a.style.align} lineHeight={1.2} />
        </>, true)
      case 'textedit': {
        const o = textEditOrigin(a.bounds, a.style.fontSize)
        return bounded(a, <>
          <Rect width={a.bounds.width} height={a.bounds.height} fill={a.coverColor} />
          <Text x={o.x - a.bounds.x} y={o.y - a.bounds.y} text={a.id === editingId ? '' : a.text} wrap="none" fontSize={a.style.fontSize} fontFamily={a.style.fontFamily} fill={a.style.color} lineHeight={1.2} />
        </>, true)
      }
      case 'stamp': {
        const c = STAMP_COLORS[a.stamp]
        return bounded(a, <>
          <Rect width={a.bounds.width} height={a.bounds.height} stroke={c} strokeWidth={2} opacity={0.9} />
          <Text width={a.bounds.width} height={a.bounds.height} text={a.stamp} fontStyle="bold" fontSize={stampFontSize(a.stamp, a.bounds.width, a.bounds.height)} fontFamily="Helvetica, Arial, sans-serif" fill={c} align="center" verticalAlign="middle" opacity={0.9} />
        </>)
      }
      case 'signature':
        return bounded(a, <SignatureImage id={a.signatureId} width={a.bounds.width} height={a.bounds.height} />)
      case 'image':
        return bounded(a, <PictureImage dataUrl={a.dataUrl} width={a.bounds.width} height={a.bounds.height} />)
      case 'link':
        return bounded(a, <Rect width={a.bounds.width} height={a.bounds.height} fill="rgba(37,99,235,0.12)" stroke="#2563eb" strokeWidth={1.5} dash={[5, 3]} />)
      case 'field':
        return bounded(a, <>
          <Rect width={a.bounds.width} height={a.bounds.height} fill="rgba(22,163,74,0.12)" stroke="#16a34a" strokeWidth={1.2} />
          {a.fieldType !== 'checkbox' && <Text x={4} width={a.bounds.width - 8} height={a.bounds.height} verticalAlign="middle" text={`${a.fieldType === 'dropdown' ? '▾ ' : ''}${a.name}`} fontSize={Math.min(11, a.bounds.height * 0.6)} fill="#166534" wrap="none" ellipsis />}
        </>)
      case 'redaction':
        return bounded(a, <Rect width={a.bounds.width} height={a.bounds.height} fill="rgba(0,0,0,0.45)" stroke="#dc2626" strokeWidth={1.5} dash={[6, 3]} />)
      case 'note':
        return (
          <Group key={a.id} {...hit(a)} {...glow(a)} x={a.position.x} y={a.position.y} draggable={draggable}
            onDblClick={() => selectable && tools.set({ editingId: a.id })} onDblTap={() => selectable && tools.set({ editingId: a.id })}
            onDragEnd={(e) => update(a.id, { position: { x: e.target.x(), y: e.target.y() } })}>
            <Rect width={22} height={22} fill={a.color} stroke="#a16207" strokeWidth={1} cornerRadius={3} />
            <Text x={6} y={3} text="i" fontStyle="bold" fontSize={14} fill="#713f12" />
          </Group>
        )
    }
  }

  const style = { stroke: tools.color, strokeWidth: tools.strokeWidth, opacity: tools.opacity }
  const draftNode = !draft ? null : draft.tool === 'freehand' ? (
    <Line points={draft.points.flatMap((p) => [p.x, p.y])} {...style} lineCap="round" lineJoin="round" tension={0.3} listening={false} />
  ) : draft.tool === 'line' || draft.tool === 'arrow' ? (
    <Line points={[draft.start.x, draft.start.y, draft.end.x, draft.end.y]} {...style} lineCap="round" listening={false} />
  ) : draft.tool === 'ellipse' ? (
    (() => { const r = normRect(draft.start, draft.end); return <Ellipse x={r.x + r.width / 2} y={r.y + r.height / 2} radiusX={r.width / 2} radiusY={r.height / 2} {...style} listening={false} /> })()
  ) : (
    <Rect {...normRect(draft.start, draft.end)} {...style} dash={draft.tool === 'redact' ? [6, 3] : undefined} listening={false} />
  )

  const editing = anns.find((a): a is Extract<Annotation, { type: 'text' | 'textedit' | 'note' }> => a.id === editingId && (a.type === 'text' || a.type === 'textedit' || a.type === 'note'))
  const editRect = editing
    ? createPageTransform(vp).rectToViewport(
        editing.type === 'text' || editing.type === 'textedit' ? editing.bounds : { x: editing.position.x, y: editing.position.y, width: 200, height: 80 },
      )
    : null

  const touchAction = active && tool !== 'select' ? 'none' : 'auto'
  return (
    <>
      <Stage
        width={size.width}
        height={size.height}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        style={{ position: 'absolute', inset: 0, pointerEvents: active ? 'auto' : 'none', touchAction, cursor: tool === 'select' ? 'default' : tool === 'eraser' ? 'not-allowed' : 'crosshair' }}
      >
        <Layer ref={layerRef}>
          <Group ref={groupRef} {...konvaGroupProps(vp)}>
            {anns.map(render)}
            {draftNode}
          </Group>
          <Transformer ref={trRef} rotateEnabled={selected?.type !== 'redaction' && selected?.type !== 'link' && selected?.type !== 'field'} keepRatio={selected?.type === 'signature' || selected?.type === 'image'} anchorSize={9} borderStroke="#2563eb" anchorStroke="#2563eb" />
        </Layer>
      </Stage>
      {editing && editRect && <InlineEditor key={editing.id} annotation={editing} rect={editRect} scale={scale} />}
    </>
  )
}

