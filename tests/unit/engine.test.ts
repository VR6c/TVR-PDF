import { afterEach, describe, expect, it, vi } from 'vitest'

describe('openPdf asset URL configuration', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes trailing-slash PDF.js asset URLs when running on an HTTP(S) origin', async () => {
    const getDocument = vi.fn(() => ({ promise: Promise.resolve({ numPages: 1 }) }))
    vi.doMock('pdfjs-dist', () => ({ getDocument, GlobalWorkerOptions: { workerSrc: '' }, PasswordResponses: { INCORRECT_PASSWORD: 2 } }))
    vi.doMock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.mjs' }))

    const { openPdf } = await import('../../src/lib/pdf/engine')
    const r = await openPdf(new ArrayBuffer(8))
    expect(r.ok).toBe(true)
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({
      wasmUrl: `${window.location.origin}/pdfjs/wasm/`,
      cMapUrl: `${window.location.origin}/pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${window.location.origin}/pdfjs/standard_fonts/`,
      iccUrl: `${window.location.origin}/pdfjs/iccs/`,
    }))
  })

  it('omits browser asset URLs outside HTTP(S) origins', async () => {
    vi.stubGlobal('window', undefined)
    const getDocument = vi.fn(() => ({ promise: Promise.resolve({ numPages: 1 }) }))
    vi.doMock('pdfjs-dist', () => ({ getDocument, GlobalWorkerOptions: { workerSrc: '' }, PasswordResponses: { INCORRECT_PASSWORD: 2 } }))
    vi.doMock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/worker.mjs' }))

    const { openPdf } = await import('../../src/lib/pdf/engine')
    const r = await openPdf(new ArrayBuffer(8))
    expect(r.ok).toBe(true)
    const arg = getDocument.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.wasmUrl).toBeUndefined()
    expect(arg.cMapUrl).toBeUndefined()
    expect(arg.standardFontDataUrl).toBeUndefined()
    expect(arg.iccUrl).toBeUndefined()
  })
})
