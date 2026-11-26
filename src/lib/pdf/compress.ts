import { PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import type { PDFDocument } from 'pdf-lib'
import type { CompressionOptions } from '../../types'

/** Re-encodes a JPEG so its longest edge is at most `maxDimension`. Returns null to keep the original. */
export type Recoder = (jpeg: Uint8Array, maxDimension: number, quality: number) => Promise<{ bytes: Uint8Array; width: number; height: number } | null>

export function stripMetadata(doc: PDFDocument) {
  doc.setTitle('')
  doc.setAuthor('')
  doc.setSubject('')
  doc.setKeywords([])
  doc.setCreator('')
  doc.setProducer('')
  doc.catalog.delete(PDFName.of('Metadata'))
}

const name = (v: unknown) => (v instanceof PDFName ? v.decodeText() : undefined)

/**
 * Downsamples embedded JPEG (DCTDecode) images in DeviceRGB/DeviceGray. Lossy by design.
 * Other image encodings (Flate, JPX, CCITT…) and other colour spaces are left untouched.
 * Returns the number of images replaced.
 */
export async function compressImages(doc: PDFDocument, opts: CompressionOptions, recode: Recoder): Promise<number> {
  let replaced = 0
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue
    const dict = obj.dict
    if (name(dict.get(PDFName.of('Subtype'))) !== 'Image') continue
    if (name(dict.get(PDFName.of('Filter'))) !== 'DCTDecode') continue
    const cs = name(dict.get(PDFName.of('ColorSpace')))
    if (cs !== 'DeviceRGB' && cs !== 'DeviceGray') continue
    const result = await recode(obj.contents, opts.maxImageDimension, opts.imageQuality)
    if (!result || result.bytes.byteLength >= obj.contents.byteLength) continue
    const next = PDFRawStream.of(dict.clone(), result.bytes)
    next.dict.set(PDFName.of('Width'), PDFNumber.of(result.width))
    next.dict.set(PDFName.of('Height'), PDFNumber.of(result.height))
    next.dict.set(PDFName.of('Length'), PDFNumber.of(result.bytes.byteLength))
    next.dict.set(PDFName.of('ColorSpace'), PDFName.of(cs))
    next.dict.delete(PDFName.of('Decode'))
    doc.context.assign(ref, next)
    replaced++
  }
  return replaced
}

/** Browser re-encoder for `compressImages`. */
export const browserRecoder: Recoder = async (jpeg, maxDimension, quality) => {
  const bitmap = await createImageBitmap(new Blob([jpeg as BlobPart], { type: 'image/jpeg' }))
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))
  const canvas = new OffscreenCanvas(width, height)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height }
}
