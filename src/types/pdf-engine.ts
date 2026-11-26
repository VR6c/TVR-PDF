import type { PageId } from './ids'
import type { PageRect, PageSize, Rotation } from './geometry'
import type { AppError, Result } from './errors'

/** Opaque handle to a document loaded inside the worker; the bytes never cross back to the UI thread. */
export type EngineDocHandle = number & { readonly __brand: 'EngineDocHandle' }

export interface DocumentInfo {
  readonly handle: EngineDocHandle
  readonly pageCount: number
  readonly pdfVersion: string | null
  readonly title: string | null
  readonly author: string | null
  readonly createdAt: Date | null
  readonly modifiedAt: Date | null
  readonly isEncrypted: boolean
  readonly hasForm: boolean
}

export interface OutlineItem {
  readonly title: string
  /** 0-based index into the ORIGINAL page list; null if the destination can't be resolved. */
  readonly pageIndex: number | null
  readonly children: readonly OutlineItem[]
}

export interface TextHit {
  readonly pageIndex: number
  readonly rects: readonly PageRect[]
  /** Short surrounding snippet for the results list. */
  readonly snippet: string
}

export interface RenderRequest {
  readonly pageIndex: number
  readonly rotation: Rotation
  /** CSS px per PDF unit. */
  readonly scale: number
  readonly devicePixelRatio: number
}

export interface PageTextItem {
  readonly text: string
  readonly bounds: PageRect
}

/** Every method is cancellable: abort rejects with code 'CANCELLED' and frees worker resources. */
export interface CallOptions {
  readonly signal?: AbortSignal
}

export interface PdfEngine {
  /** Resolves PASSWORD_REQUIRED / PASSWORD_INCORRECT instead of throwing so the UI can prompt and retry. */
  open(bytes: ArrayBuffer, opts?: CallOptions & { password?: string }): Promise<Result<DocumentInfo>>
  close(handle: EngineDocHandle): Promise<void>

  pageSize(handle: EngineDocHandle, pageIndex: number): Promise<PageSize>
  /** Returned bitmap is transferred; the caller owns it and must call `.close()`. */
  renderPage(handle: EngineDocHandle, req: RenderRequest, opts?: CallOptions): Promise<ImageBitmap>
  pageText(handle: EngineDocHandle, pageIndex: number, opts?: CallOptions): Promise<readonly PageTextItem[]>

  outline(handle: EngineDocHandle): Promise<readonly OutlineItem[]>
  search(handle: EngineDocHandle, query: string, opts?: CallOptions & { caseSensitive?: boolean }): AsyncIterable<TextHit>
}

/**
 * Wire protocol for pdf.worker.ts. Requests carry a numeric `id`; the worker
 * replies with exactly one `result` or `error` for it, or a `cancel` ack.
 * Large buffers are transferred, never copied. Add variants; never change one in place.
 */
export type WorkerRequest<Method extends string, Params> = {
  readonly id: number
  readonly method: Method
  readonly params: Params
}

export type WorkerResponse<T> =
  | { readonly id: number; readonly kind: 'result'; readonly value: T }
  | { readonly id: number; readonly kind: 'progress'; readonly done: number; readonly total: number }
  | { readonly id: number; readonly kind: 'error'; readonly error: AppError }

/** Sent by the UI to abort an in-flight request. */
export interface WorkerCancel {
  readonly id: number
  readonly kind: 'cancel'
}

/** A page as the user sees it: the stable id plus where its content comes from. */
export interface PageRef {
  readonly pageId: PageId
  /** Which source PDF (0 = the document itself; >0 = inserted/merged sources). */
  readonly sourceIndex: number
  /** 0-based page in that source. */
  readonly sourcePageIndex: number
  /** User rotation added on top of the page's intrinsic rotation. */
  readonly rotation: Rotation
}
