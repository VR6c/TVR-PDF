/**
 * Coordinate spaces (see FR-03 "Annotation Coordinate System"):
 *
 *  - Page space:     PDF user units (1/72 in), origin top-left of the UNROTATED page,
 *                    y grows downward. This is the ONLY space persisted.
 *  - Viewport space: CSS pixels of the rendered page after zoom + rotation.
 *  - Canvas space:   Konva stage pixels (viewport space times devicePixelRatio).
 *
 * Origin is top-left (not PDF's bottom-left) so Konva and pdf-lib export share
 * one convention; the flip to PDF's bottom-left happens once, in export.
 */

export type Rotation = 0 | 90 | 180 | 270

export interface PagePoint {
  readonly x: number
  readonly y: number
}

export interface PageRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PageSize {
  /** Unrotated width/height in PDF user units, after applying the page's CropBox. */
  readonly width: number
  readonly height: number
}

/** The state that maps between page space and viewport space for one page. */
export interface PageViewport {
  readonly pageSize: PageSize
  /** Effective rotation: intrinsic /Rotate plus user rotation. */
  readonly rotation: Rotation
  /** CSS pixels per PDF unit (zoom * 96/72). */
  readonly scale: number
}

export interface PageTransform {
  toViewport(p: PagePoint): PagePoint
  toPage(p: PagePoint): PagePoint
  rectToViewport(r: PageRect): PageRect
  rectToPage(r: PageRect): PageRect
}
