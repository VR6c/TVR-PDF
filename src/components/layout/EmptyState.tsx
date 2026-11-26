import { FileText, FileUp, HardDrive, ShieldCheck, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { documentRepo } from '../../lib/storage/repositories'
import { pickPdf, useOpener } from '../../stores/opener'
import type { DocumentSummary } from '../../types'

const PROMISES = [
  { icon: ShieldCheck, text: 'Files never leave your device' },
  { icon: WifiOff, text: 'Works offline once loaded' },
  { icon: HardDrive, text: 'Autosaved on this device' },
]

export function EmptyState() {
  const { busy, openStored } = useOpener()
  const [recent, setRecent] = useState<DocumentSummary[]>([])
  useEffect(() => {
    documentRepo.listRecent(8).then((r) => setRecent([...r])).catch(() => setRecent([]))
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-workspace">
      <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-6 px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border bg-surface px-5 py-8 text-center sm:px-8 sm:py-10">
          <span className="grid size-14 place-items-center rounded-full bg-accent-soft text-accent"><FileUp size={26} aria-hidden /></span>
          <div>
            <h1 className="text-xl font-semibold">Open a PDF</h1>
            <p className="mt-1 text-muted">Drag files here, or choose them. Free, offline, and nothing leaves your device.</p>
          </div>
          <button type="button" onClick={pickPdf} disabled={busy} className="min-h-10 w-full rounded-md bg-accent px-5 py-2 font-medium text-accent-text hover:opacity-90 disabled:opacity-60 sm:w-auto">
            {busy ? 'Opening…' : 'Choose PDF'}
          </button>
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-1.5"><Icon size={14} aria-hidden />{text}</li>
            ))}
          </ul>
        </div>
        {recent.length > 0 && (
          <section aria-label="Recent documents">
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Recent documents</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
              {recent.map((d) => (
                <li key={d.id}>
                  <button type="button" onClick={() => void openStored(d.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2">
                    <FileText size={18} className="shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{d.fileName}</span>
                      <span className="text-xs text-muted">{d.pageCount} {d.pageCount === 1 ? 'page' : 'pages'} · {new Date(d.lastOpenedAt).toLocaleDateString()}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
