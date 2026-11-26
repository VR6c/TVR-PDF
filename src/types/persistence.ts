import type { Annotation } from './annotations'
import type { DocumentId, SessionId, SignatureId } from './ids'
import type { PageRef } from './pdf-engine'
import type { Result } from './errors'

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export const MAX_SAVED_SIGNATURES = 5

/** Row in the `documents` table. The big binary lives in `fileBuffer`; everything else is small metadata. */
export interface DocumentRecord {
  readonly id: DocumentId
  readonly fileName: string
  readonly fileBuffer: ArrayBuffer
  readonly fileSize: number
  readonly pageCount: number
  readonly annotations: readonly Annotation[]
  /** Replaces the old pageOrder/rotationMetadata pair: one ordered list carries both. */
  readonly pages: readonly PageRef[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly lastOpenedAt: number
  readonly saveStatus: SaveStatus
  /** Bumped on every write; a writer with a stale value fails with DRAFT_CONFLICT (protects against overwriting a newer draft from another tab or a crashed session). */
  readonly revision: number
}

/** List views must not load `fileBuffer`. */
export type DocumentSummary = Omit<DocumentRecord, 'fileBuffer' | 'annotations' | 'pages'>

export interface SignatureRecord {
  readonly id: SignatureId
  readonly label: string
  readonly mime: 'image/png' | 'image/jpeg'
  readonly imageData: ArrayBuffer
  readonly createdAt: number
}

export interface SessionRecord {
  readonly id: SessionId
  readonly documentId: DocumentId
  readonly currentPage: number
  readonly zoom: number | 'fit-width' | 'fit-page'
  readonly activeTool: string
  readonly sidebar: 'thumbnails' | 'outline' | 'search' | 'forms' | null
  readonly updatedAt: number
}

export interface SettingsRecord {
  readonly id: 'app'
  readonly theme: 'light' | 'dark' | 'system'
  readonly language: string
  readonly defaultZoom: number | 'fit-width' | 'fit-page'
  readonly preferences: Readonly<Record<string, string | number | boolean>>
}

export interface DocumentRepository {
  create(fileName: string, bytes: ArrayBuffer, pageCount: number): Promise<Result<DocumentId>>
  get(id: DocumentId): Promise<Result<DocumentRecord>>
  listRecent(limit: number): Promise<readonly DocumentSummary[]>
  /** Compare-and-set on `revision`; the new revision is returned. */
  saveDraft(
    id: DocumentId,
    changes: Pick<DocumentRecord, 'annotations' | 'pages'> & Partial<Pick<DocumentRecord, 'fileBuffer' | 'pageCount'>>,
    expectedRevision: number,
  ): Promise<Result<number>>
  touch(id: DocumentId): Promise<void>
  remove(id: DocumentId): Promise<void>
}

export interface SignatureRepository {
  list(): Promise<readonly SignatureRecord[]>
  /** SIGNATURE_LIMIT_REACHED beyond MAX_SAVED_SIGNATURES. */
  add(input: Pick<SignatureRecord, 'label' | 'mime' | 'imageData'>): Promise<Result<SignatureId>>
  remove(id: SignatureId): Promise<void>
}

export interface StorageManager {
  estimate(): Promise<{ readonly usage: number; readonly quota: number } | null>
  /** Deletes documents, drafts, annotations, signatures, sessions and settings, after the caller has confirmed. */
  clearAll(): Promise<void>
}
