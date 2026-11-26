/// <reference lib="webworker" />
import { browserRecoder } from '../lib/pdf/compress'
import { browserTextRasterizer } from '../lib/pdf/rasterText'
import { exportPdf } from '../lib/pdf/export'
import { applyFormValues, listFormFields } from '../lib/pdf/forms'
import { assemble, cropPages, extractPages, imagesToPdf, insertBlankPage, insertDocument, loadPdfLib, resizePages, splitPdf } from '../lib/pdf/pageOps'
import { decryptPdf, encryptPdf } from '../lib/pdf/qpdf'
import { ok } from '../types'
import qpdfWasm from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

/**
 * Heavy pdf-lib work runs here so the UI thread stays responsive.
 * Protocol (see types/pdf-engine.ts): {id, method, params} in; {id, kind: 'result'|'progress'|'error'} out;
 * {id, kind: 'cancel'} in aborts. Buffers in results are transferred, not copied.
 */
const aborts = new Map<number, AbortController>()

const handlers: Record<string, (p: any, ctx: { signal: AbortSignal; progress: (f: number) => void }) => Promise<unknown>> = {
  export: (p, ctx) => exportPdf(p.req, { recode: p.compress ? browserRecoder : undefined, rasterizer: browserTextRasterizer, onProgress: ctx.progress, signal: ctx.signal }),
  assemble: (p) => assemble(p.sources, p.plan),
  insert: (p) => insertDocument(p.bytes, p.other, p.at),
  crop: (p) => cropPages(p.bytes, p.indexes, p.margins),
  resize: (p) => resizePages(p.bytes, p.indexes, p.width, p.height),
  images: (p) => imagesToPdf(p.images),
  decrypt: (p) => decryptPdf(qpdfWasm, p.bytes, p.password),
  encrypt: (p) => encryptPdf(qpdfWasm, p.bytes, p.password),
  blank: (p) => insertBlankPage(p.bytes, p.at),
  extract: (p) => extractPages(p.bytes, p.indexes),
  split: (p) => splitPdf(p.bytes, p.groups),
  forms: (p) => listFormFields(p.bytes),
  fill: async (p) => {
    const loaded = await loadPdfLib(p.bytes)
    if (!loaded.ok) return loaded
    const filled = applyFormValues(loaded.value, p.values)
    if (!filled.ok) return filled
    loaded.value.getForm().updateFieldAppearances()
    return ok(await loaded.value.save({ useObjectStreams: false }))
  },
}

const transferables = (v: unknown): Transferable[] => {
  const out: Transferable[] = []
  const visit = (x: unknown) => {
    if (x instanceof ArrayBuffer) out.push(x)
    else if (ArrayBuffer.isView(x)) out.push(x.buffer as ArrayBuffer)
    else if (Array.isArray(x)) x.forEach(visit)
    else if (x && typeof x === 'object') Object.values(x).forEach(visit)
  }
  visit(v)
  return [...new Set(out)]
}

self.onmessage = async (e: MessageEvent) => {
  const { id, method, kind, params } = e.data as { id: number; method?: string; kind?: 'cancel'; params?: unknown }
  if (kind === 'cancel') return void aborts.get(id)?.abort()
  const handler = method ? handlers[method] : undefined
  if (!handler) return self.postMessage({ id, kind: 'error', error: { code: 'INTERNAL', message: `Unknown method ${method}` } })
  const ctl = new AbortController()
  aborts.set(id, ctl)
  try {
    const value = await handler(params, { signal: ctl.signal, progress: (f) => self.postMessage({ id, kind: 'progress', done: f, total: 1 }) })
    self.postMessage({ id, kind: 'result', value }, transferables(value))
  } catch {
    self.postMessage({ id, kind: 'error', error: { code: 'INTERNAL', message: 'The PDF operation failed.' } })
  } finally {
    aborts.delete(id)
  }
}
