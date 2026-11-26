import { X } from 'lucide-react'
import { flushSave } from '../../lib/autosave'
import { closeDocument, useTabs } from '../../lib/session'
import { useDocument } from '../../stores/document'
import { useOpener } from '../../stores/opener'

/** Each tab is a fully autosaved document, so switching reloads it from local storage (undo history is per session). */
export function TabBar() {
  const tabs = useTabs((s) => s.tabs)
  const active = useDocument((s) => s.docId)
  const { openStored } = useOpener()
  if (tabs.length < 2) return null

  return (
    <div role="tablist" aria-label="Open documents" className="scroll-strip flex shrink-0 overflow-x-auto border-b border-border bg-bg">
      {tabs.map((t) => (
        <div key={t.id} className={`flex shrink-0 items-center border-r border-border ${t.id === active ? 'bg-surface shadow-[inset_0_-2px_0_var(--accent)]' : 'text-muted'}`}>
          <button
            role="tab"
            type="button"
            aria-selected={t.id === active}
            onClick={async () => { if (t.id !== active) { await flushSave(); await openStored(t.id) } }}
            className="max-w-40 truncate px-3 py-2 text-xs sm:max-w-56 pointer-coarse:py-3"
            title={t.name}
          >{t.name}</button>
          <button
            type="button"
            aria-label={`Close ${t.name}`}
            onClick={async () => {
              const rest = tabs.filter((x) => x.id !== t.id)
              if (t.id === active) {
                await closeDocument()
                useTabs.getState().set(rest)
                if (rest.length) await openStored(rest[rest.length - 1].id)
              } else useTabs.getState().set(rest)
            }}
            className="mr-1 inline-flex size-6 items-center justify-center rounded hover:bg-surface-2 pointer-coarse:size-8"
          ><X size={12} aria-hidden /></button>
        </div>
      ))}
    </div>
  )
}
