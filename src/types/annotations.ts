import type { AnnotationId, PageId, SignatureId } from './ids'
import type { PagePoint, PageRect } from './geometry'

/** Increment on any breaking change to the JSON import/export format (FR-11). */
export const ANNOTATION_SCHEMA_VERSION = 1

interface AnnotationBase {
  readonly id: AnnotationId
  readonly pageId: PageId
  /** Stacking order within the page; higher draws on top. */
  readonly zIndex: number
  readonly createdAt: number
  readonly updatedAt: number
}

export interface StrokeStyle {
  /** `#rrggbb` */
  readonly color: string
  /** 0..1 */
  readonly opacity: number
  /** In page units, so it scales with zoom. */
  readonly width: number
}

export interface TextStyle {
  readonly color: string
  readonly fontFamily: string
  /** In page units. */
  readonly fontSize: number
  readonly align: 'left' | 'center' | 'right'
}

export interface TextMarkupAnnotation extends AnnotationBase {
  readonly type: 'highlight' | 'underline' | 'strikethrough'
  /** One rect per selected text line. */
  readonly quads: readonly PageRect[]
  readonly color: string
  readonly opacity: number
}

export interface FreehandAnnotation extends AnnotationBase {
  readonly type: 'freehand'
  readonly points: readonly PagePoint[]
  readonly style: StrokeStyle
}

export interface ShapeAnnotation extends AnnotationBase {
  readonly type: 'rectangle' | 'ellipse'
  readonly bounds: PageRect
  readonly rotation: number
  readonly stroke: StrokeStyle
  /** `null` = no fill. */
  readonly fill: { readonly color: string; readonly opacity: number } | null
}

export interface LineAnnotation extends AnnotationBase {
  readonly type: 'line' | 'arrow'
  readonly start: PagePoint
  readonly end: PagePoint
  readonly style: StrokeStyle
}

export interface TextBoxAnnotation extends AnnotationBase {
  readonly type: 'text'
  readonly bounds: PageRect
  readonly rotation: number
  readonly text: string
  readonly style: TextStyle
}

/**
 * Replacement for a line of existing page text: `bounds` (the original text's area) is painted over with
 * `coverColor`, then `text` is drawn on top. The original text stays in the file beneath the cover
 * unless the area is also redacted (the PDF's own content stream is never rewritten).
 */
export interface TextEditAnnotation extends AnnotationBase {
  readonly type: 'textedit'
  readonly bounds: PageRect
  readonly originalText: string
  readonly text: string
  readonly coverColor: string
  readonly style: TextStyle
}

export interface StickyNoteAnnotation extends AnnotationBase {
  readonly type: 'note'
  readonly position: PagePoint
  readonly text: string
  readonly color: string
}

export type StampKind = 'APPROVED' | 'CONFIDENTIAL' | 'DRAFT' | 'PAID'

export interface StampAnnotation extends AnnotationBase {
  readonly type: 'stamp'
  readonly stamp: StampKind
  readonly bounds: PageRect
  readonly rotation: number
}

export interface SignatureAnnotation extends AnnotationBase {
  readonly type: 'signature'
  /** Placed copy: the image is embedded by reference so deleting the vault entry doesn't break the document. */
  readonly signatureId: SignatureId
  /** Aspect ratio is locked: exporters derive height from width. */
  readonly bounds: PageRect
  readonly rotation: number
}

/** A clickable region: opens a web address, or jumps to another page of this document. */
export interface LinkAnnotation extends AnnotationBase {
  readonly type: 'link'
  readonly bounds: PageRect
  /** http(s) or mailto; empty when the link targets a page. */
  readonly url: string
  readonly targetPageId: PageId | null
}

export type FormFieldType = 'text' | 'checkbox' | 'dropdown'

/** A fillable form field to create in the exported PDF (an AcroForm widget). */
export interface FormFieldAnnotation extends AnnotationBase {
  readonly type: 'field'
  readonly fieldType: FormFieldType
  /** Unique name within the PDF; made unique on export if it collides. */
  readonly name: string
  readonly bounds: PageRect
  /** Choices for a dropdown. */
  readonly options: readonly string[]
}

/** A picture placed on the page. The (downscaled) image is stored inside the annotation as a data URL. */
export interface ImageAnnotation extends AnnotationBase {
  readonly type: 'image'
  readonly mime: 'image/png' | 'image/jpeg'
  readonly dataUrl: string
  /** Aspect ratio is locked: resizing keeps width/height. */
  readonly bounds: PageRect
  readonly rotation: number
}

/**
 * A region marked for permanent redaction. It is only a marker until applied:
 * applying rebuilds the page as an image with the region blacked out (see lib/pdf/redact.ts).
 */
export interface RedactionAnnotation extends AnnotationBase {
  readonly type: 'redaction'
  readonly bounds: PageRect
}

/** Discriminate on `type`. Adding a variant makes every exhaustive switch fail to compile. */
export type Annotation =
  | TextMarkupAnnotation
  | FreehandAnnotation
  | ShapeAnnotation
  | LineAnnotation
  | TextBoxAnnotation
  | TextEditAnnotation
  | StickyNoteAnnotation
  | StampAnnotation
  | SignatureAnnotation
  | ImageAnnotation
  | LinkAnnotation
  | FormFieldAnnotation
  | RedactionAnnotation

/** Omit that distributes over a union, so discriminated variants keep their own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What the caller supplies; id, timestamps and zIndex are assigned by the store. */
export type NewAnnotation = DistributiveOmit<Annotation, 'id' | 'createdAt' | 'updatedAt' | 'zIndex'>

/** Partial update: `type`, `id` and `pageId` are immutable (moving between pages is an explicit action). */
export type AnnotationPatch = Partial<
  DistributiveOmit<Annotation, 'type' | 'id' | 'pageId' | 'createdAt' | 'updatedAt'>
>

/** Documented JSON interchange format (FR-11). Untrusted on import; validate before use. */
export interface AnnotationExportFile {
  readonly schemaVersion: typeof ANNOTATION_SCHEMA_VERSION
  readonly exportedAt: string
  /** Page order at export time; annotations reference pages by index here, remapped to PageIds on import. */
  readonly pageCount: number
  readonly annotations: readonly (DistributiveOmit<Annotation, 'pageId'> & { readonly pageIndex: number })[]
}

/**
 * Store contract. Every mutation is one undo step; continuous gestures
 * (drag, resize, freehand) use begin/commit so they collapse to a single step.
 */
export interface AnnotationStore {
  list(pageId: PageId): readonly Annotation[]
  get(id: AnnotationId): Annotation | undefined
  add(input: NewAnnotation): AnnotationId
  update(id: AnnotationId, patch: AnnotationPatch): void
  remove(id: AnnotationId): void
  moveToPage(id: AnnotationId, pageId: PageId, at: PagePoint): void

  beginGesture(): void
  /** Throws if no gesture is open. */
  commitGesture(): void
  cancelGesture(): void
}
