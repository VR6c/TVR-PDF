import { describe, expect, it } from 'vitest'
import { exportAnnotations, importAnnotations } from '../../src/lib/annotations/io'
import type { Annotation, AnnotationId, PageId, PageRef } from '../../src/types'

const pages: PageRef[] = [0, 1].map((i) => ({ pageId: `p${i}` as PageId, sourceIndex: 0, sourcePageIndex: i, rotation: 0 }))
const line: Annotation = {
  id: 'a1' as AnnotationId, pageId: pages[1].pageId, zIndex: 1, createdAt: 1, updatedAt: 1,
  type: 'line', start: { x: 0, y: 0 }, end: { x: 5, y: 5 }, style: { color: '#112233', opacity: 1, width: 2 },
}

describe('annotation JSON', () => {
  it('round-trips and remaps pages by index with fresh ids', () => {
    const file = JSON.parse(JSON.stringify(exportAnnotations([line], pages)))
    expect(file.annotations[0].pageIndex).toBe(1)
    const swapped = [pages[1], pages[0]]
    const r = importAnnotations(file, swapped)
    if (!r.ok) throw new Error(r.error.message)
    expect(r.value[0].pageId).toBe(swapped[1].pageId)
    expect(r.value[0].id).not.toBe(line.id)
  })

  it.each([
    ['not an object', 'x'],
    ['wrong version', { schemaVersion: 99, annotations: [] }],
    ['unknown type', { schemaVersion: 1, annotations: [{ type: 'evil', pageIndex: 0 }] }],
    ['NaN coordinate', { schemaVersion: 1, annotations: [{ ...line, pageIndex: 0, start: { x: null, y: 0 } }] }],
    ['bad color', { schemaVersion: 1, annotations: [{ ...line, pageIndex: 0, style: { color: 'red', opacity: 1, width: 1 } }] }],
    ['page out of range', { schemaVersion: 1, annotations: [{ ...line, pageIndex: 7 }] }],
    ['huge stroke', { schemaVersion: 1, annotations: [{ ...line, pageIndex: 0, style: { color: '#000000', opacity: 1, width: 1e9 } }] }],
  ])('rejects %s', (_n, input) => {
    const r = importAnnotations(input, pages)
    expect(r.ok === false && r.error.code).toBe('INVALID_ANNOTATION_DATA')
  })
})
