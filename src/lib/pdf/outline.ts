import { PDFDict, PDFHexString, PDFName, PDFNumber, PDFRef } from 'pdf-lib'
import type { PDFDocument } from 'pdf-lib'

export interface OutlineEntry {
  title: string
  /** 0-based index in the final document. */
  pageIndex: number
}

/** Appends top-level bookmarks to the document outline, keeping any bookmarks already there. */
export function appendBookmarks(doc: PDFDocument, entries: readonly OutlineEntry[]): number {
  const pages = doc.getPages()
  const valid = entries.filter((e) => e.title.trim() && pages[e.pageIndex])
  if (!valid.length) return 0
  const ctx = doc.context

  let rootRef = doc.catalog.get(PDFName.of('Outlines'))
  let root = rootRef instanceof PDFRef ? ctx.lookupMaybe(rootRef, PDFDict) : undefined
  if (!root) {
    root = ctx.obj({ Type: 'Outlines', Count: 0 })
    rootRef = ctx.register(root)
    doc.catalog.set(PDFName.of('Outlines'), rootRef)
  }
  const rootR = rootRef as PDFRef

  let last = root.get(PDFName.of('Last'))
  let added = 0
  for (const e of valid) {
    const dict = ctx.obj({
      Title: PDFHexString.fromText(e.title.trim()),
      Parent: rootR,
      Dest: [pages[e.pageIndex].ref, 'Fit'],
    })
    const ref = ctx.register(dict)
    if (last instanceof PDFRef) {
      dict.set(PDFName.of('Prev'), last)
      ctx.lookup(last, PDFDict).set(PDFName.of('Next'), ref)
    } else {
      root.set(PDFName.of('First'), ref)
    }
    last = ref
    added++
  }
  root.set(PDFName.of('Last'), last!)
  const count = root.get(PDFName.of('Count'))
  root.set(PDFName.of('Count'), PDFNumber.of((count instanceof PDFNumber ? count.asNumber() : 0) + added))
  return added
}
