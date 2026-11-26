import { create } from 'zustand'
import { signatureRepo } from '../lib/storage/repositories'
import type { AppError, SignatureId, SignatureRecord } from '../types'

export interface LoadedSignature extends SignatureRecord {
  url: string
  /** Natural aspect ratio (width / height) so placement keeps proportions. */
  aspect: number
}

const measure = (url: string) =>
  new Promise<number>((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth / Math.max(1, img.naturalHeight))
    img.onerror = () => resolve(3)
    img.src = url
  })

async function hydrate(r: SignatureRecord): Promise<LoadedSignature> {
  const url = URL.createObjectURL(new Blob([r.imageData], { type: r.mime }))
  return { ...r, url, aspect: await measure(url) }
}

interface SignatureState {
  items: LoadedSignature[]
  load: () => Promise<void>
  add: (label: string, mime: 'image/png' | 'image/jpeg', bytes: ArrayBuffer) => Promise<AppError | null>
  remove: (id: SignatureId) => Promise<void>
  byId: (id: SignatureId) => LoadedSignature | undefined
}

export const useSignatures = create<SignatureState>((set, get) => ({
  items: [],
  load: async () => {
    get().items.forEach((i) => URL.revokeObjectURL(i.url))
    set({ items: await Promise.all((await signatureRepo.list()).map(hydrate)) })
  },
  add: async (label, mime, imageData) => {
    const r = await signatureRepo.add({ label, mime, imageData })
    if (!r.ok) return r.error
    await get().load()
    return null
  },
  remove: async (id) => {
    await signatureRepo.remove(id)
    await get().load()
  },
  byId: (id) => get().items.find((i) => i.id === id),
}))
