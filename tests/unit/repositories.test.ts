import { beforeEach, describe, expect, it } from 'vitest'
import { StudioDB } from '../../src/lib/storage/db'
import { createDocumentRepository, createSignatureRepository, createStorageManager, toStorageError } from '../../src/lib/storage/repositories'
import { MAX_SAVED_SIGNATURES } from '../../src/types'

let db: StudioDB
beforeEach(async () => {
  db = new StudioDB(`test-${Math.random()}`)
  await db.open()
})

const bytes = (n = 8) => new Uint8Array(n).buffer

describe('document repository', () => {
  it('creates, reads back, and lists without heavy fields', async () => {
    const repo = createDocumentRepository(db)
    const created = await repo.create('a.pdf', bytes(16), 3)
    if (!created.ok) throw new Error('create failed')
    const got = await repo.get(created.value)
    expect(got.ok && got.value.fileBuffer.byteLength).toBe(16)
    const [summary] = await repo.listRecent(5)
    expect(summary.fileName).toBe('a.pdf')
    expect('fileBuffer' in summary).toBe(false)
    expect('annotations' in summary).toBe(false)
  })

  it('rejects a stale revision instead of overwriting a newer draft', async () => {
    const repo = createDocumentRepository(db)
    const created = await repo.create('a.pdf', bytes(), 1)
    if (!created.ok) throw new Error()
    const first = await repo.saveDraft(created.value, { annotations: [], pages: [] }, 0)
    expect(first).toEqual({ ok: true, value: 1 })
    const stale = await repo.saveDraft(created.value, { annotations: [], pages: [] }, 0)
    expect(stale.ok === false && stale.error.code).toBe('DRAFT_CONFLICT')
  })

  it('removes the file along with the record', async () => {
    const repo = createDocumentRepository(db)
    const created = await repo.create('a.pdf', bytes(), 1)
    if (!created.ok) throw new Error()
    await repo.remove(created.value)
    expect(await db.files.count()).toBe(0)
    expect((await repo.get(created.value)).ok).toBe(false)
  })
})

describe('signature repository', () => {
  it(`enforces the ${MAX_SAVED_SIGNATURES}-signature limit`, async () => {
    const repo = createSignatureRepository(db)
    for (let i = 0; i < MAX_SAVED_SIGNATURES; i++) {
      expect((await repo.add({ label: `s${i}`, mime: 'image/png', imageData: bytes() })).ok).toBe(true)
    }
    const over = await repo.add({ label: 'x', mime: 'image/png', imageData: bytes() })
    expect(over.ok === false && over.error.code).toBe('SIGNATURE_LIMIT_REACHED')
  })
})

describe('storage manager', () => {
  it('clearAll wipes every table', async () => {
    const docs = createDocumentRepository(db)
    await docs.create('a.pdf', bytes(), 1)
    await createSignatureRepository(db).add({ label: 's', mime: 'image/png', imageData: bytes() })
    await db.settings.put({ id: 'app', theme: 'light', language: 'en', defaultZoom: 1, preferences: {} })
    await createStorageManager(db).clearAll()
    const counts = await Promise.all([db.documents.count(), db.files.count(), db.signatures.count(), db.settings.count()])
    expect(counts).toEqual([0, 0, 0, 0])
  })
  it('maps quota errors to a distinct code', () => {
    const e = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    expect(toStorageError(e).code).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(toStorageError(new Error('x')).code).toBe('STORAGE_FAILURE')
  })
})
