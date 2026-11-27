import type { Page } from '@playwright/test'
import { PDFDocument, PDFName, PDFRawStream, StandardFonts } from 'pdf-lib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(process.cwd(), 'tests/e2e/.fixtures')

async function make(name: string, pages: string[]): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const text of pages) doc.addPage([612, 792]).drawText(text, { x: 72, y: 700, size: 28, font })
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, await doc.save())
  return path
}

export const fixtures = {
  sample: () => make('sample.pdf', ['Page one alpha', 'Page two beta', 'Page three gamma', 'Page four delta']),
  secret: () => make('secret.pdf', ['TOP-SECRET-9931 launch code', 'Public page']),
}

export async function openPdf(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: /Open PDF/ }).click()
  await (await chooser).setFiles(path)
  await page.locator('canvas').first().waitFor()
}

export async function exportAnnotationsJson(page: Page): Promise<{ annotations: { type: string; pageIndex: number }[] }> {
  await page.getByRole('button', { name: /Import \/ export annotations/ }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export annotations/ }).click()
  const d = await download
  const path = await d.path()
  const json = JSON.parse((await import('node:fs')).readFileSync(path, 'utf8'))
  await page.keyboard.press('Escape')
  return json
}

/** Forces the download fallback: the native save picker can't be driven in automation. */
export const noSavePicker = (page: Page) => page.addInitScript(() => { (window as any).showSaveFilePicker = undefined })

/** A PDF whose only content is a raster image of text (what a scan looks like). */
export async function scanned(): Promise<string> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const c = createCanvas(1200, 400)
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 1200, 400)
  g.fillStyle = '#000'
  g.font = 'bold 110px sans-serif'
  g.fillText('Hello Scanned World', 40, 240)
  const doc = await PDFDocument.create()
  const img = await doc.embedPng(c.toBuffer('image/png'))
  const page = doc.addPage([600, 200])
  page.drawImage(img, { x: 0, y: 0, width: 600, height: 200 })
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'scanned.pdf')
  writeFileSync(path, await doc.save())
  return path
}

export async function withForm(): Promise<string> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 300])
  const form = doc.getForm()
  const f = form.createTextField('fullName')
  f.addToPage(page, { x: 50, y: 200, width: 250, height: 28 })
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'form.pdf')
  writeFileSync(path, await doc.save())
  return path
}

/** A PDF with one large, poorly compressible JPEG, to exercise image downsampling. */
export async function heavyImage(): Promise<string> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const c = createCanvas(2400, 1800)
  const g = c.getContext('2d')
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `hsl(${(i * 37) % 360} 80% ${30 + (i % 40)}%)`
    g.fillRect((i * 97) % 2400, (i * 53) % 1800, 40 + (i % 90), 40 + ((i * 7) % 90))
  }
  const doc = await PDFDocument.create()
  const img = await doc.embedJpg(c.toBuffer('image/jpeg', 95))
  doc.addPage([600, 450]).drawImage(img, { x: 0, y: 0, width: 600, height: 450 })
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'heavy.pdf')
  writeFileSync(path, await doc.save())
  return path
}

export async function bigDocument(pages: number): Promise<string> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const p = doc.addPage([612, 792])
    p.drawText(`Page ${i} of ${pages}`, { x: 72, y: 700, size: 24, font })
    for (let l = 0; l < 40; l++) p.drawText(`Line ${l} lorem ipsum dolor sit amet consectetur`, { x: 72, y: 650 - l * 14, size: 10, font })
  }
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `big-${pages}.pdf`)
  writeFileSync(path, await doc.save())
  return path
}

/** A PDF with a CCITTFaxDecode Group 4 ImageMask layer (how MRC scanners store black text masks). */
export async function ccittMask(): Promise<string> {
  // 8x8 solid black mask in CCITT Group 4 (/K -1): row 1 H(001)+W0(00110101)+B8(000101), rows 2-8 V(0)x2 each, EOFB.
  const bits = '001' + '00110101' + '000101' + '1'.repeat(14) + '000000000001000000000001'
  const padded = bits.padEnd(Math.ceil(bits.length / 8) * 8, '0')
  const ccitt = new Uint8Array(padded.length / 8)
  for (let i = 0; i < ccitt.length; i++) ccitt[i] = parseInt(padded.slice(i * 8, i * 8 + 8), 2)

  const doc = await PDFDocument.create()
  const page = doc.addPage([200, 200])
  const mask = PDFRawStream.of(doc.context.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 8,
    Height: 8,
    BitsPerComponent: 1,
    ImageMask: true,
    Filter: 'CCITTFaxDecode',
    DecodeParms: { K: -1, Columns: 8 },
    Length: ccitt.length,
  }), ccitt)
  page.node.setXObject(PDFName.of('M1'), doc.context.register(mask))
  page.node.set(PDFName.of('Contents'), doc.context.register(doc.context.flateStream('q 0 0 0 rg 100 0 0 100 50 50 cm /M1 Do Q')))
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'ccitt-mask.pdf')
  writeFileSync(path, await doc.save())
  return path
}
