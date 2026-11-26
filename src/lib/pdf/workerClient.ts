import type { AppError, Result, WorkerResponse } from '../../types'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: any) => void; onProgress?: (f: number) => void }>()

function ensure(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../../workers/pdf.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<WorkerResponse<unknown>>) => {
    const m = e.data
    const p = pending.get(m.id)
    if (!p) return
    if (m.kind === 'progress') return p.onProgress?.(m.done / m.total)
    pending.delete(m.id)
    p.resolve(m.kind === 'result' ? m.value : { ok: false, error: m.error })
  }
  worker.onerror = () => {
    for (const [, p] of pending) p.resolve({ ok: false, error: { code: 'INTERNAL', message: 'The PDF worker crashed.' } })
    pending.clear()
    worker = null
  }
  return worker
}

/**
 * Calls a method in the PDF worker. Methods return `Result<T>`; transport failures and
 * cancellation also surface as a failed Result, never a throw.
 */
export function callWorker<T>(
  method: string,
  params: unknown,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void; transfer?: Transferable[] } = {},
): Promise<Result<T>> {
  const w = ensure()
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, { resolve, onProgress: opts.onProgress })
    opts.signal?.addEventListener('abort', () => {
      w.postMessage({ id, kind: 'cancel' })
      pending.delete(id)
      resolve({ ok: false, error: { code: 'CANCELLED', message: 'Cancelled' } satisfies AppError })
    }, { once: true })
    w.postMessage({ id, method, params }, opts.transfer ?? [])
  })
}
