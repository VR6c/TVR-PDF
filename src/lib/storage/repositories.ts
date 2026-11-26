import type { DocumentRepository, DocumentSummary, SignatureRepository, StorageManager, AppError } from '../../types'
import { MAX_SAVED_SIGNATURES, err, newId, ok } from '../../types'
import type { DocumentId, SignatureId } from '../../types'
import { db as defaultDb } from './db'
import type { StudioDB } from './db'

export function toStorageError(e: unknown): AppError {
  const name = e instanceof Error ? e.name : ''
  const inner = (e as { inner?: { name?: string } } | null)?.inner?.name
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return { code: 'STORAGE_QUOTA_EXCEEDED', message: 'Not enough browser storage to save this document.' }
  }
  return { code: 'STORAGE_FAILURE', message: 'Could not read or write local storage.' }
}

export function createDocumentRepository(db: StudioDB = defaultDb): DocumentRepository {
  return {
    async create(fileName, bytes, pageCount) {
      const id = newId<DocumentId>()
      const now = Date.now()
      try {
        await db.transaction('rw', db.documents, db.files, async () => {
          await db.files.put({ id, buffer: bytes })
          await db.documents.put({
            id, fileName, fileSize: bytes.byteLength, pageCount, annotations: [], pages: [],
            createdAt: now, updatedAt: now, lastOpenedAt: now, saveStatus: 'saved', revision: 0,
          })
        })
        return ok(id)
      } catch (e) {
        return err(toStorageError(e))
      }
    },

    async get(id) {
      try {
        const [row, file] = await Promise.all([db.documents.get(id), db.files.get(id)])
        if (!row || !file) return err({ code: 'STORAGE_FAILURE', message: 'Document not found in local storage.' })
        return ok({ ...row, fileBuffer: file.buffer })
      } catch (e) {
        return err(toStorageError(e))
      }
    },

    async listRecent(limit) {
      const rows = await db.documents.orderBy('lastOpenedAt').reverse().limit(limit).toArray()
      return rows.map(({ annotations: _a, pages: _p, ...summary }): DocumentSummary => summary)
    },

    async saveDraft(id, changes, expectedRevision) {
      try {
        return await db.transaction('rw', db.documents, db.files, async () => {
          const row = await db.documents.get(id)
          if (!row) return err({ code: 'STORAGE_FAILURE' as const, message: 'Document no longer exists.' })
          if (row.revision !== expectedRevision) {
            return err({ code: 'DRAFT_CONFLICT' as const, message: 'A newer version of this draft exists.' })
          }
          const revision = row.revision + 1
          if (changes.fileBuffer) await db.files.put({ id, buffer: changes.fileBuffer })
          await db.documents.put({
            ...row,
            annotations: changes.annotations,
            pages: changes.pages,
            pageCount: changes.pageCount ?? row.pageCount,
            fileSize: changes.fileBuffer?.byteLength ?? row.fileSize,
            updatedAt: Date.now(),
            saveStatus: 'saved',
            revision,
          })
          return ok(revision)
        })
      } catch (e) {
        return err(toStorageError(e))
      }
    },

    async touch(id) {
      await db.documents.update(id, { lastOpenedAt: Date.now() })
    },

    async remove(id) {
      await db.transaction('rw', db.documents, db.files, db.documentSessions, async () => {
        await db.documents.delete(id)
        await db.files.delete(id)
        await db.documentSessions.where('documentId').equals(id).delete()
      })
    },
  }
}

export function createSignatureRepository(db: StudioDB = defaultDb): SignatureRepository {
  return {
    list: () => db.signatures.orderBy('createdAt').toArray(),
    async add(input) {
      try {
        return await db.transaction('rw', db.signatures, async () => {
          if ((await db.signatures.count()) >= MAX_SAVED_SIGNATURES) {
            return err({ code: 'SIGNATURE_LIMIT_REACHED' as const, message: `You can save up to ${MAX_SAVED_SIGNATURES} signatures. Delete one first.` })
          }
          const id = newId<SignatureId>()
          await db.signatures.put({ ...input, id, createdAt: Date.now() })
          return ok(id)
        })
      } catch (e) {
        return err(toStorageError(e))
      }
    },
    async remove(id) {
      await db.signatures.delete(id)
    },
  }
}

export function createStorageManager(db: StudioDB = defaultDb): StorageManager {
  return {
    async estimate() {
      if (!navigator.storage?.estimate) return null
      const { usage = 0, quota = 0 } = await navigator.storage.estimate()
      return { usage, quota }
    },
    async clearAll() {
      await db.transaction('rw', [db.documents, db.files, db.signatures, db.documentSessions, db.settings], async () => {
        await Promise.all([db.documents.clear(), db.files.clear(), db.signatures.clear(), db.documentSessions.clear(), db.settings.clear()])
      })
    },
  }
}

export const documentRepo = createDocumentRepository()
export const signatureRepo = createSignatureRepository()
export const storageManager = createStorageManager()
