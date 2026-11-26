import type { Annotation } from './annotations'
import type { PageRef } from './pdf-engine'
import type { SignatureId } from './ids'
import type { CallOptions } from './pdf-engine'
import type { Result } from './errors'

export interface CompressionOptions {
  /** Longest edge in pixels; larger embedded JPEG images are downsampled (lossy). */
  readonly maxImageDimension: number
  /** 0..1 JPEG quality for re-encoded images. */
  readonly imageQuality: number
  readonly stripMetadata: boolean
}

export interface PageDecorations {
  /** Diagonal text across every page. */
  readonly watermark?: { readonly text: string; readonly opacity: number }
  /** `{n}` and `{total}` are replaced per page. */
  readonly header?: string
  readonly footer?: string
  readonly pageNumbers?: { readonly format: string; readonly position: 'left' | 'center' | 'right' }
}

export interface DocumentMetadata {
  readonly title?: string
  readonly author?: string
  readonly subject?: string
  readonly keywords?: string
}

/** A user bookmark, anchored to a page so it survives reordering. */
export interface UserBookmark {
  readonly id: string
  readonly pageId: PageRef['pageId']
  readonly title: string
}

export interface ExportRequest {
  readonly source: ArrayBuffer
  /** Final page list in display order; omitted pages are deleted. */
  readonly pages: readonly PageRef[]
  readonly annotations: readonly Annotation[]
  /** Image bytes keyed by id, so the worker needs no database access. */
  readonly signatures: ReadonlyMap<SignatureId, { readonly mime: 'image/png' | 'image/jpeg'; readonly bytes: ArrayBuffer }>
  /** Interactive form values by fully-qualified field name. */
  readonly formValues?: Readonly<Record<string, string | boolean>>
  readonly compression?: CompressionOptions
  readonly decorations?: PageDecorations
  readonly metadata?: DocumentMetadata
  /** Written to the PDF outline, after the document's own bookmarks. */
  readonly bookmarks?: readonly UserBookmark[]
  /** OCR text per page to embed as an invisible layer. */
  readonly ocrLayer?: ReadonlyMap<PageRef['pageId'], readonly { text: string; x: number; y: number; width: number; height: number }[]>
}

export interface ExportResult {
  readonly bytes: ArrayBuffer
  readonly originalSize: number
  readonly exportedSize: number
}

export interface Exporter {
  /**
   * Annotations are written as standard PDF content so any viewer shows them.
   * Unapplied redaction markers make this fail with REDACTION_UNSAFE: redaction must be
   * applied (lib/pdf/redact.ts) first, so an overlay is never mistaken for removal.
   */
  export(req: ExportRequest, opts?: CallOptions & { onProgress?: (fraction: number) => void }): Promise<Result<ExportResult>>
}

/** Parses "1-3, 5, 8-10" into sorted, de-duplicated 0-based indexes. INVALID_PAGE_RANGE on bad input. */
export type ParsePageRange = (input: string, pageCount: number) => Result<readonly number[]>
