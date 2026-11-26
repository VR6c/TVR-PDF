import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFileSync, writeFileSync } from 'node:fs'
import { fixtures, noSavePicker, openPdf } from './helpers'

let sample: string
let secret: string
test.beforeAll(async () => {
  sample = await fixtures.sample()
  secret = await fixtures.secret()
})

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void d.accept())
  await noSavePicker(page)
  await page.goto('/')
  await page.evaluate(async () => { for (const d of await indexedDB.databases()) if (d.name) indexedDB.deleteDatabase(d.name) })
  await page.reload()
})

const menu = async (page: import('@playwright/test').Page, name: RegExp) => {
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name }).click()
}

test('15. protects an export with a password, then reopens, unlocks and edits it', async ({ page }, info) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export PDF' })
  await dlg.getByLabel('Protect with a password (AES-256)').check()
  await dlg.getByLabel('New password').fill('hunter22')
  await dlg.getByLabel('Confirm password').fill('hunter22')
  const dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Export', exact: true }).click()
  const bytes = readFileSync((await (await dl).path())!)
  await expect(PDFDocument.load(bytes)).rejects.toThrow() // really encrypted
  const protectedPath = info.outputPath('protected.pdf')
  writeFileSync(protectedPath, bytes)
  await page.keyboard.press('Escape')

  await openPdf(page, protectedPath).catch(() => undefined)
  const pw = page.getByLabel(/password/i).first()
  await pw.fill('hunter22')
  await page.keyboard.press('Enter')
  await expect(page.getByText('of 4')).toBeVisible()

  await menu(page, /Unlock for editing/)
  const unlock = page.getByRole('dialog', { name: 'Unlock for editing' })
  await unlock.getByLabel('Document password').fill('hunter22')
  await unlock.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText(/Unlocked/)).toBeVisible()

  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dl2 = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click()
  expect((await PDFDocument.load(readFileSync((await (await dl2).path())!))).getPageCount()).toBe(4)
})

test('16. exports a page as an image', async ({ page }) => {
  await openPdf(page, sample)
  await menu(page, /Export pages as images/)
  const dlg = page.getByRole('dialog', { name: 'Export pages as images' })
  await dlg.getByLabel('Pages to export').fill('2')
  const dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Export', exact: true }).click()
  const d = await dl
  expect(d.suggestedFilename()).toBe('sample-page-2.png')
  expect(readFileSync((await d.path())!).subarray(1, 4).toString()).toBe('PNG')
})

test('17. compares two PDFs and shows what changed', async ({ page }) => {
  await openPdf(page, sample)
  await menu(page, /Compare with another PDF/)
  const dlg = page.getByRole('dialog', { name: 'Compare PDFs' })
  await dlg.getByLabel('PDF to compare with').setInputFiles(sample)
  await expect(dlg.getByText('No differences found.')).toBeVisible({ timeout: 30_000 })
  await dlg.getByLabel('PDF to compare with').setInputFiles(secret)
  await expect(dlg.getByText(/pages? differ/)).toBeVisible({ timeout: 30_000 })
  await dlg.getByRole('button', { name: /Page 1/ }).click()
  await expect(dlg.getByText(/Page one alpha/)).toBeVisible()
})

test('18. highlights search results on the page and saves a bookmark', async ({ page }) => {
  await openPdf(page, sample)
  await page.getByRole('button', { name: /Search/ }).first().click()
  await page.getByLabel('Search in document').fill('alpha')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-search-hit="active"]').first()).toBeVisible()

  await page.getByRole('tab', { name: 'Bookmarks' }).click()
  await page.getByRole('button', { name: /Bookmark page/ }).click()
  await expect(page.getByLabel(/Bookmark title, page 1/)).toBeVisible()
})

test('19. adds a blank page and a link, and exports a working PDF', async ({ page }) => {
  await openPdf(page, sample)
  await menu(page, /Organize pages/)
  const dlg = page.getByRole('dialog', { name: 'Organize pages' })
  await dlg.getByRole('button', { name: 'Insert blank page' }).click()
  await expect(dlg.getByRole('listitem')).toHaveCount(5)
  await page.keyboard.press('Escape')
  await expect(page.getByText('of 5')).toBeVisible() // viewer has reloaded the edited document

  await page.getByRole('button', { name: /Link \(drag an area\)/ }).click()
  await page.locator('[data-page="1"] canvas').first().waitFor()
  const b = (await page.locator('[data-page="1"]').boundingBox())!
  await page.mouse.move(b.x + 100, b.y + 300)
  await page.mouse.down()
  await page.mouse.move(b.x + 260, b.y + 340, { steps: 5 })
  await page.mouse.up()
  await page.getByLabel('Link address').fill('https://example.com')

  await page.getByRole('button', { name: 'Export PDF' }).click()
  const dl = page.waitForEvent('download')
  await page.getByRole('dialog', { name: 'Export PDF' }).getByRole('button', { name: 'Export', exact: true }).click()
  const out = await PDFDocument.load(readFileSync((await (await dl).path())!))
  expect(out.getPageCount()).toBe(5)
  expect(out.getPage(0).node.Annots()?.size()).toBe(1)
})
