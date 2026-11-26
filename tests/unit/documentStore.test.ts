import { beforeEach, describe, expect, it } from 'vitest'
import { useDocument } from '../../src/stores/document'
import type { DocumentId, NewAnnotation, PageId } from '../../src/types'

const page = 'p1' as PageId
const line = (x: number): NewAnnotation => ({
  type: 'line', pageId: page, start: { x, y: 0 }, end: { x: x + 10, y: 10 }, style: { color: '#000000', opacity: 1, width: 1 },
})
const s = () => useDocument.getState()

beforeEach(() => {
  s().load({ docId: 'd' as DocumentId, bytes: new ArrayBuffer(1), pages: [], annotations: [], revision: 0, encrypted: false })
})

describe('document store history', () => {
  it('undoes and redoes add / update / remove as separate steps', () => {
    const id = s().add(line(0))
    s().update(id, { start: { x: 5, y: 5 } })
    s().remove(id)
    expect(s().annotations).toHaveLength(0)
    s().undo()
    expect(s().annotations).toHaveLength(1)
    s().undo()
    expect(s().get(id)).toMatchObject({ start: { x: 0, y: 0 } })
    s().undo()
    expect(s().annotations).toHaveLength(0)
    s().redo()
    expect(s().annotations).toHaveLength(1)
  })

  it('collapses a gesture of many updates into a single undo step', () => {
    const id = s().add(line(0))
    s().beginGesture()
    for (let x = 1; x <= 20; x++) s().update(id, { start: { x, y: 0 } })
    s().commitGesture()
    expect(s().get(id)).toMatchObject({ start: { x: 20, y: 0 } })
    s().undo()
    expect(s().get(id)).toMatchObject({ start: { x: 0, y: 0 } })
    s().undo()
    expect(s().annotations).toHaveLength(0)
  })

  it('cancelGesture restores the pre-gesture state and records nothing', () => {
    const id = s().add(line(0))
    s().beginGesture()
    s().update(id, { start: { x: 9, y: 9 } })
    s().cancelGesture()
    expect(s().get(id)).toMatchObject({ start: { x: 0, y: 0 } })
    expect(useDocument.temporal.getState().pastStates).toHaveLength(1)
  })

  it('commitGesture without begin throws; a new action clears redo', () => {
    expect(() => s().commitGesture()).toThrow()
    s().add(line(0))
    s().undo()
    s().add(line(1))
    expect(useDocument.temporal.getState().futureStates).toHaveLength(0)
  })

  it('lists annotations per page in z-order and marks the doc dirty', () => {
    const a = s().add(line(0))
    const b = s().add(line(1))
    expect(s().list(page).map((x) => x.id)).toEqual([a, b])
    expect(s().dirty).toBe(true)
  })
})
