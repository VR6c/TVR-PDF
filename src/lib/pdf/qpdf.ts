import createModule from '@neslinesli93/qpdf-wasm'
import { err, ok } from '../../types'
import type { Result } from '../../types'

/**
 * qpdf (WebAssembly) handles what pdf-lib can't: reading and writing encrypted PDFs.
 * Each call gets a fresh module instance so no document data lingers in its virtual file system.
 * `wasm` is where the browser (or, in tests, the file system) finds qpdf.wasm.
 */
async function run(wasm: string, input: Uint8Array, args: (i: string, o: string) => string[], decrypting = false): Promise<Result<Uint8Array>> {
  const log: string[] = []
  try {
    const qpdf = await createModule({ locateFile: () => wasm, noInitialRun: true, print: (s: string) => log.push(s), printErr: (s: string) => log.push(s) } as never)
    ;(qpdf.FS as unknown as { writeFile: (p: string, d: Uint8Array) => void }).writeFile('/in.pdf', input)
    let code: number
    try {
      code = qpdf.callMain(args('/in.pdf', '/out.pdf'))
    } catch (e) {
      code = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : 2
    }
    // 0 = ok, 3 = ok with warnings. Anything else: no usable output.
    if (code !== 0 && code !== 3) {
      const msg = log.join(' ').toLowerCase()
      // Some runtimes write qpdf's message straight to stderr instead of `printErr`; a decrypt that fails on
      // an input that does look like a PDF is, in practice, a wrong password.
      const looksLikePdf = input[0] === 0x25 && input[1] === 0x50 && input[2] === 0x44 && input[3] === 0x46
      return msg.includes('password') || (decrypting && looksLikePdf) ? err({ code: 'PASSWORD_INCORRECT', message: 'Incorrect password' }) : err({ code: 'CORRUPTED_PDF', message: 'The PDF could not be processed.' })
    }
    const out = qpdf.FS.readFile('/out.pdf')
    return ok(new Uint8Array(out)) // copy out of the module's memory
  } catch {
    return err({ code: 'INTERNAL', message: 'The PDF could not be processed.' })
  }
}

/** Removes encryption using the password the user typed. The result opens in pdf-lib. */
export const decryptPdf = (wasm: string, bytes: ArrayBuffer | Uint8Array, password: string) =>
  run(wasm, new Uint8Array(bytes), (i, o) => [`--password=${password}`, '--decrypt', i, o], true)

/** AES-256 encryption. `password` is needed to open; the same value is used as the owner password. */
export const encryptPdf = (wasm: string, bytes: ArrayBuffer | Uint8Array, password: string) =>
  run(wasm, new Uint8Array(bytes), (i, o) => ['--encrypt', password, password, '256', '--', i, o])
