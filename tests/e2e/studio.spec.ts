import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import { exportAnnotationsJson, fixtures, noSavePicker, openPdf } from './helpers'

let sample: string
let secret: string
test.beforeAll(async () => {
  sample = await fixtures.sample()
  secret = await fixtures.secret()
})

test.beforeEach(async ({ page }) => {
  // The app asks before leaving with unsaved edits; accept so reloads and teardown never block.
  page.on('dialog', (d) => void d.accept())
  await noSavePicker(page)
  await page.goto('/')
  // each test starts from a clean local database
  await page.evaluate(async () => { for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name) })
  await page.reload()
})

test('1. imports a PDF and renders it', async ({ page }) => {
  await openPdf(page, sample)
  await expect(page.getByText('sample.pdf').first()).toBeVisible()
  await expect(page.getByText('of 4')).toBeVisible()
  await expect(page.locator('.textLayer span').first()).toBeVisible()
})

test('2. highlights text and adds a text annotation', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Highlight text' }).click()
  const span = page.locator('.textLayer span').first()
  await span.waitFor()
  const box = (await span.boundingBox())!
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()

  await page.getByRole('button', { name: 'Text box' }).click()
  const pageBox = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.click(pageBox.x + 200, pageBox.y + 300)
  await page.getByLabel('Text box content').fill('Hello Acrobat')
  await page.keyboard.press('Control+Enter')

  const json = await exportAnnotationsJson(page)
  const types = json.annotations.map((a) => a.type)
  expect(types).toContain('highlight')
  expect(types).toContain('text')
})

test('3. draws freehand on a page', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Freehand drawing' }).click()
  const b = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.move(b.x + 100, b.y + 400)
  await page.mouse.down()
  await page.mouse.move(b.x + 200, b.y + 450, { steps: 8 })
  await page.mouse.move(b.x + 300, b.y + 400, { steps: 8 })
  await page.mouse.up()
  expect((await exportAnnotationsJson(page)).annotations.map((a) => a.type)).toContain('freehand')
})

test('4. creates a signature and places it on page 3', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Signature', exact: true }).click()
  const pad = page.getByLabel('Signature drawing area')
  const p = (await pad.boundingBox())!
  await page.mouse.move(p.x + 40, p.y + 80)
  await page.mouse.down()
  await page.mouse.move(p.x + 120, p.y + 40, { steps: 6 })
  await page.mouse.move(p.x + 200, p.y + 100, { steps: 6 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Save and place' }).click()
  await expect(page.locator('dialog[open]')).toHaveCount(0)

  await page.getByLabel('Page number').fill('3')
  await page.getByLabel('Page number').press('Enter')
  // wait until page 3 is scrolled into view and its annotation layer (a second canvas) exists
  await expect.poll(async () => await page.locator('[data-page="3"] canvas').count()).toBeGreaterThan(1)
  await expect.poll(async () => (await page.locator('[data-page="3"]').boundingBox())!.y).toBeLessThan(500)
  const b = (await page.locator('[data-page="3"]').boundingBox())!
  await page.mouse.click(b.x + 250, b.y + 250)
  const json = await exportAnnotationsJson(page)
  expect(json.annotations.find((a) => a.type === 'signature')?.pageIndex).toBe(2)

  // the vault survives a reload
  await page.reload()
  await page.getByRole('button', { name: 'Signature', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Saved signatures' })).toBeVisible()
})

test('5. deletes page 2 and reorders pages', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /Organize pages/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Organize pages' })
  await dialog.getByRole('listitem').nth(1).click()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(dialog.getByRole('listitem')).toHaveCount(3)
  // move (old) page 4 to the front: it should now be the third item
  await dialog.getByRole('listitem').nth(2).dragTo(dialog.getByRole('listitem').nth(0))
  await page.keyboard.press('Escape')
  await expect(page.getByText('of 3')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo (Ctrl/Cmd+Z)' })).toBeEnabled()
})

test('6. exports a PDF that reopens with the expected content', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Rectangle' }).click()
  const b = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.move(b.x + 100, b.y + 300)
  await page.mouse.down()
  await page.mouse.move(b.x + 260, b.y + 380, { steps: 5 })
  await page.mouse.up()
  // delete page 4 so export reflects page edits too
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /Organize pages/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Organize pages' })
  await dialog.getByRole('listitem').nth(3).click()
  await dialog.getByRole('button', { name: 'Delete' }).click()
  await expect(dialog.getByRole('listitem')).toHaveCount(3)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Export PDF' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click()
  const out = await PDFDocument.load(readFileSync((await (await download).path())!))
  expect(out.getPageCount()).toBe(3)
})

test('7. recovers the previous document after a refresh', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Rectangle' }).click()
  const b = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.move(b.x + 100, b.y + 300)
  await page.mouse.down()
  await page.mouse.move(b.x + 260, b.y + 380, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByText('Saved on this device')).toBeVisible({ timeout: 15_000 })
  await page.reload()
  await expect(page.getByText(/Restored “sample.pdf”/)).toBeVisible()
  await expect(page.getByText('of 4')).toBeVisible()
  await page.getByRole('button', { name: 'Select / move annotations' }).click()
  expect((await exportAnnotationsJson(page)).annotations.map((a) => a.type)).toContain('rectangle')
})

test('8. works offline after the first load', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await page.reload() // let the service worker take control
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await openPdf(page, sample)
  await expect(page.getByText('Saved on this device')).toBeVisible({ timeout: 15_000 })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('of 4')).toBeVisible() // shell from cache, document from IndexedDB
  await expect(page.locator('canvas').first()).toBeVisible()
  await context.setOffline(false)
})

test('9. never sends document data over the network', async ({ page }) => {
  const requests: { url: string; method: string; body: string | null }[] = []
  page.on('request', (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }))
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Freehand drawing' }).click()
  const b = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.move(b.x + 100, b.y + 400)
  await page.mouse.down()
  await page.mouse.move(b.x + 200, b.y + 450, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click()
  await dl
  const origin = new URL(page.url()).origin
  const foreign = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('blob:') && !r.url.startsWith('data:'))
  expect(foreign).toEqual([])
  expect(requests.filter((r) => r.method !== 'GET' && r.method !== 'HEAD')).toEqual([])
  expect(requests.filter((r) => r.body)).toEqual([])
})

test('10. permanent redaction removes the text from the exported file', async ({ page }) => {
  await openPdf(page, secret)
  await page.getByRole('button', { name: 'Mark area for redaction' }).click()
  const b = (await page.locator('[data-page="1"]').boundingBox())!
  // the text sits near the top-left: x 72..~450, y ≈ 792-700-28 = 64..92 from the top
  await page.mouse.move(b.x + 60, b.y + 55)
  await page.mouse.down()
  await page.mouse.move(b.x + 480, b.y + 100, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: /Apply 1 redaction/ }).click()
  await expect(page.getByText(/Redactions applied/)).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click()
  const bytes = readFileSync((await (await dl).path())!)
  expect(bytes.toString('latin1')).not.toContain('SECRET-9931')
  expect(bytes.toString('latin1')).not.toContain('TOP-SECRET')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
  const text = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
  expect(text).not.toContain('SECRET')
  const page2 = (await (await doc.getPage(2)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
  expect(page2).toContain('Public page')
})

test('11. reports a storage quota error', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...a) {
      if (this.name === 'files') throw new DOMException('quota', 'QuotaExceededError')
      return orig.apply(this, a as never)
    }
  })
  await page.reload()
  await openPdf(page, sample)
  await expect(page.getByRole('alert').filter({ hasText: /Not enough browser storage/ })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible() // still viewable
})

test('12. degrades gracefully without optional browser APIs', async ({ page }) => {
  await page.addInitScript(() => {
    ;(navigator.storage as any).estimate = undefined
    ;(window as any).launchQueue = undefined
  })
  await page.reload()
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: /Storage and privacy/ }).click()
  await expect(page.getByText(/cannot report storage usage/)).toBeVisible()
})
