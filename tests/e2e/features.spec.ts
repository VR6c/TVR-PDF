import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { bigDocument, fixtures, heavyImage, noSavePicker, openPdf, scanned, withForm } from './helpers'

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await noSavePicker(page)
  await page.goto('/')
  await page.evaluate(async () => { for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name) })
  await page.reload()
})

async function exportPdf(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click()
  return readFileSync((await (await dl).path())!)
}

test('13. OCR recognizes a scan offline-capable and embeds a searchable text layer', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openPdf(page, await scanned())
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /Recognize text/ }).click()
  const dialog = page.getByRole('dialog', { name: /OCR/ })
  await dialog.getByRole('button', { name: 'Start OCR' }).click()
  await expect(dialog.getByText(/^Done\./)).toBeVisible({ timeout: 120_000 })
  await expect(dialog.getByText(/words/)).toBeVisible()
  await page.keyboard.press('Escape')
  const bytes = await exportPdf(page)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
  expect(text.toLowerCase()).toContain('hello')
  expect(text.toLowerCase()).toContain('world')
})

test('14. fills a form field and the value survives export', async ({ page }) => {
  await openPdf(page, await withForm())
  await page.getByRole('tab', { name: 'Forms' }).click()
  await page.getByLabel('fullName').fill('Sokun Rom')
  await page.getByRole('button', { name: 'Apply values' }).click()
  await expect(page.getByText('Form values applied.')).toBeVisible()
  const bytes = await exportPdf(page)
  const out = await PDFDocument.load(bytes)
  expect(out.getForm().getTextField('fullName').getText()).toBe('Sokun Rom')
})

test('15. compression shrinks an image-heavy PDF and the result still opens', async ({ page }) => {
  const src = await heavyImage()
  await openPdf(page, src)
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dialog = page.getByRole('dialog', { name: 'Export PDF' })
  await dialog.getByLabel(/Compress images/).check()
  await dialog.getByRole('combobox', { name: 'Largest image edge' }).click()
  await page.getByRole('option', { name: '1000px' }).click()
  const dl = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const out = readFileSync((await (await dl).path())!)
  expect(out.length).toBeLessThan(statSync(src).size * 0.7)
  expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
})

test('16. benchmark: 500-page document opens and navigates', async ({ page }) => {
  test.setTimeout(120_000)
  const path = await bigDocument(500)
  const t0 = Date.now()
  await openPdf(page, path)
  await page.locator('.textLayer span').first().waitFor()
  const firstRender = Date.now() - t0
  const t1 = Date.now()
  await page.getByLabel('Page number').fill('400')
  await page.getByLabel('Page number').press('Enter')
  await expect(page.locator('[data-page="400"] .textLayer span').first()).toBeVisible({ timeout: 30_000 })
  const jump = Date.now() - t1
  const rendered = await page.locator('canvas').evaluateAll((cs) => cs.filter((c) => (c as HTMLCanvasElement).width > 0).length)
  const mem = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0)
  const report = `# Benchmarks (measured, not targets)\n\nDevice: ${os.cpus()[0].model}, ${os.cpus().length} cores, ${(os.totalmem() / 2 ** 30).toFixed(0)} GB RAM, ${os.platform()} ${os.release()}, headless Chromium via Playwright.\nDocument: generated, 500 pages × ~40 text lines (${(statSync(path).size / 1048576).toFixed(2)} MB).\n\n| Metric | Result |\n|---|---|\n| File chosen → first page text visible | ${firstRender} ms |\n| Jump from page 1 to page 400 until its text is visible | ${jump} ms |\n| Canvases holding pixels after the jump (virtualization) | ${rendered} of 500 pages |\n| JS heap | ${(mem / 1048576).toFixed(0)} MB |\n\nRun \`npx playwright test -g benchmark\` to regenerate. The 150 ms single-page target is not asserted here.\n`
  writeFileSync('docs/BENCHMARKS.md', report)
  expect(rendered).toBeLessThan(40)
})

test('17. Edit text replaces a line of existing page text and exports it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openPdf(page, await fixtures.sample())
  await page.getByRole('button', { name: /Edit existing text/ }).click()
  await page.locator('.textLayer span', { hasText: 'Page one alpha' }).first().click()
  const editor = page.getByRole('textbox', { name: 'Replacement text' })
  await expect(editor).toHaveValue('Page one alpha')
  await editor.fill('Page one OMEGA')
  await editor.press('Control+Enter')
  await expect(editor).toHaveCount(0)
  const bytes = await exportPdf(page)
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
  expect(text).toContain('Page one OMEGA')
  expect(errors).toEqual([])
})
