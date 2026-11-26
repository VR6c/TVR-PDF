import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { DocumentId, DocumentRecord, SessionId, SessionRecord, SettingsRecord, SignatureId, SignatureRecord } from '../../types'

/** Document metadata and edit state. The (large) PDF bytes live in `files` so list views stay cheap. */
export type DocumentRow = Omit<DocumentRecord, 'fileBuffer'>
export interface FileRow {
  id: DocumentId
  buffer: ArrayBuffer
}

export class StudioDB extends Dexie {
  documents!: Table<DocumentRow, DocumentId>
  files!: Table<FileRow, DocumentId>
  signatures!: Table<SignatureRecord, SignatureId>
  documentSessions!: Table<SessionRecord, SessionId>
  settings!: Table<SettingsRecord, string>

  constructor(name = 'local-first-pdf-studio') {
    super(name)
    // Add a new `version(n)` with an `upgrade` for any schema change; never edit a shipped version.
    this.version(1).stores({
      documents: 'id, lastOpenedAt, updatedAt',
      files: 'id',
      signatures: 'id, createdAt',
      documentSessions: 'id, documentId, updatedAt',
      settings: 'id',
    })
  }
}

export const db = new StudioDB()
