import { useEffect, useState } from 'react'
import { useExtras } from '../../stores/extras'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { Modal } from '../common/Modal'

const pdfDate = (s: unknown): string => {
  const m = typeof s === 'string' ? /D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s) : null
  if (!m) return '—'
  const [, y, mo = '01', d = '01', h = '00', mi = '00', sec = '00'] = m
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${sec}`).toLocaleString()
}

export function InfoDialog() {
  const close = useUI((s) => s.close)
  const { doc, fileName, fileSize } = useViewer()
  const [rows, setRows] = useState<[string, string][]>([])
  const [info, setInfo] = useState<Record<string, unknown>>({})
  const saved = useExtras((s) => s.metadata)
  const setMetadata = useExtras((s) => s.setMetadata)
  const [draft, setDraft] = useState<{ title?: string; author?: string; subject?: string; keywords?: string }>({})
  const field = (k: 'title' | 'author' | 'subject' | 'keywords', pdfKey: string) =>
    draft[k] ?? saved[k] ?? (typeof info[pdfKey] === 'string' ? (info[pdfKey] as string) : '')

  useEffect(() => {
    if (!doc) return
    let alive = true
    doc.getMetadata().then(({ info }) => {
      if (!alive) return
      const i = info as Record<string, unknown>
      setInfo(i)
      const text = (v: unknown) => (typeof v === 'string' && v ? v : '—')
      setRows([
        ['Creator', text(i.Creator)], ['Producer', text(i.Producer)], ['PDF version', text(i.PDFFormatVersion)],
        ['Created', pdfDate(i.CreationDate)], ['Modified', pdfDate(i.ModDate)],
      ])
    }).catch(() => setRows([]))
    return () => { alive = false }
  }, [doc])

  if (!doc) return null
  const size = fileSize > 1048576 ? `${(fileSize / 1048576).toFixed(2)} MB` : `${(fileSize / 1024).toFixed(1)} KB`
  return (
    <Modal title="Document properties" onClose={close}>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5">
        {([['File name', fileName], ['File size', size], ['Pages', String(doc.numPages)], ...rows] as [string, string][]).map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="break-words">{v}</dd></div>
        ))}
      </dl>
      <form
        className="mt-4 flex flex-col gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          setMetadata({ title: field('title', 'Title'), author: field('author', 'Author'), subject: field('subject', 'Subject'), keywords: field('keywords', 'Keywords') })
          close()
        }}
      >
        <p className="text-muted">Edit properties. They are written into the PDF when you export.</p>
        {([['title', 'Title', 'Title'], ['author', 'Author', 'Author'], ['subject', 'Subject', 'Subject'], ['keywords', 'Keywords (comma separated)', 'Keywords']] as const).map(([k, label, pdfKey]) => (
          <label key={k} className="grid grid-cols-[8rem_1fr] items-center gap-x-3">{label}
            <input value={field(k, pdfKey)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="rounded border border-border bg-bg px-2 py-1" />
          </label>
        ))}
        <div className="flex justify-end"><button type="submit" className="rounded-md bg-accent px-4 py-1.5 font-medium text-accent-text">Save properties</button></div>
      </form>
    </Modal>
  )
}
