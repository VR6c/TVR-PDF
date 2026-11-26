import { AlertCircle, Info } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { CombineDialog } from './components/common/CombineDialog'
import { PasswordDialog } from './components/common/PasswordDialog'
import { EmptyState } from './components/layout/EmptyState'
import { StatusBar } from './components/layout/StatusBar'
import { TabBar } from './components/layout/TabBar'
import { TopBar } from './components/layout/TopBar'
import { Toolbar } from './components/toolbar/Toolbar'
import { useShortcuts } from './hooks/useShortcuts'
import { startAutosave } from './lib/autosave'
import { openPdf } from './lib/pdf/engine'
import { getSettings } from './lib/storage/settings'
import { useDocument } from './stores/document'
import { useNotice } from './stores/notice'
import { useOpener } from './stores/opener'
import { useSignatures } from './stores/signatures'
import { useUI } from './stores/ui'
import { useViewer } from './stores/viewer'

const AnnotationIoDialog = lazy(() => import('./components/dialogs/AnnotationIoDialog').then((m) => ({ default: m.AnnotationIoDialog })))
const ExportDialog = lazy(() => import('./components/dialogs/ExportDialog').then((m) => ({ default: m.ExportDialog })))
const ImagesDialog = lazy(() => import('./components/dialogs/ImagesDialog').then((m) => ({ default: m.ImagesDialog })))
const CompareDialog = lazy(() => import('./components/dialogs/CompareDialog').then((m) => ({ default: m.CompareDialog })))
const UnlockDialog = lazy(() => import('./components/dialogs/UnlockDialog').then((m) => ({ default: m.UnlockDialog })))
const InfoDialog = lazy(() => import('./components/dialogs/InfoDialog').then((m) => ({ default: m.InfoDialog })))
const OcrDialog = lazy(() => import('./components/dialogs/OcrDialog').then((m) => ({ default: m.OcrDialog })))
const PageManagerDialog = lazy(() => import('./components/dialogs/PageManagerDialog').then((m) => ({ default: m.PageManagerDialog })))
const SignatureDialog = lazy(() => import('./components/dialogs/SignatureDialog').then((m) => ({ default: m.SignatureDialog })))
const StorageDialog = lazy(() => import('./components/dialogs/StorageDialog').then((m) => ({ default: m.StorageDialog })))
const Viewer = lazy(() => import('./components/pdf/Viewer').then((m) => ({ default: m.Viewer })))
const Sidebar = lazy(() => import('./components/sidebar/Sidebar').then((m) => ({ default: m.Sidebar })))
const PropertiesPanel = lazy(() => import('./components/toolbar/PropertiesPanel').then((m) => ({ default: m.PropertiesPanel })))

function Banner({ kind, text, onDismiss, action }: { kind: 'info' | 'error'; text: string; onDismiss: () => void; action?: { label: string; run: () => void } | null }) {
  const Icon = kind === 'error' ? AlertCircle : Info
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm text-white ${kind === 'error' ? 'bg-red-700' : 'bg-slate-700'}`}>
      <span className="flex min-w-0 flex-1 basis-60 items-start gap-2"><Icon size={16} className="mt-0.5 shrink-0" aria-hidden /><span className="min-w-0 break-words">{text}</span></span>
      <span className="ml-auto flex gap-1">
        {action && <button type="button" onClick={action.run} className="rounded px-2 py-1 font-medium underline hover:bg-white/15 pointer-coarse:py-2">{action.label}</button>}
        <button type="button" onClick={onDismiss} className="rounded px-2 py-1 hover:bg-white/15 pointer-coarse:py-2">Dismiss</button>
      </span>
    </div>
  )
}

interface LaunchParams { files: { getFile(): Promise<File> }[] }

export default function App() {
  const doc = useViewer((s) => s.doc)
  const docId = useDocument((s) => s.docId)
  const fileName = useViewer((s) => s.fileName)
  const sidebarOpen = useViewer((s) => s.sidebarOpen)
  const baseBytes = useDocument((s) => s.baseBytes)
  const dialog = useUI((s) => s.dialog)
  const closeDialog = useUI((s) => s.close)
  const toggleSidebar = useViewer((s) => s.toggleSidebar)
  const { error, notice, dismissError, dismissNotice, openFiles, openStored } = useOpener()
  const note = useNotice()
  const [dragging, setDragging] = useState(false)
  useShortcuts()

  // Startup: autosave, signature vault, session recovery, and OS file association.
  useEffect(() => {
    const stop = startAutosave()
    void useSignatures.getState().load()
    void getSettings().then((s) => {
      const id = s.preferences.lastDocId
      if (typeof id === 'string' && !useViewer.getState().doc) void openStored(id as never, { recovered: true })
    })
    const lq = (window as unknown as { launchQueue?: { setConsumer(f: (p: LaunchParams) => void): void } }).launchQueue
    lq?.setConsumer(async (p) => {
      const files = await Promise.all(p.files.map((h) => h.getFile()))
      if (files.length) void openFiles(files)
    })
    return stop
  }, [openFiles, openStored])

  // Page edits and undo/redo change the working PDF; re-open it in the viewer.
  useEffect(() => {
    const v = useViewer.getState()
    if (!baseBytes || !v.doc || baseBytes === v.bytes) return
    let alive = true
    void openPdf(baseBytes).then((r) => {
      if (!alive) return
      if (r.ok) useViewer.getState().replaceDocument(r.value, baseBytes)
      else useNotice.getState().show('error', 'Could not reload the document after that change.')
    })
    return () => { alive = false }
  }, [baseBytes])

  // Warn before closing with unsaved (not yet persisted) edits.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useDocument.getState().dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      setDragging(true)
    }
    const leave = (e: DragEvent) => { if (e.relatedTarget === null) setDragging(false) }
    const drop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length) void openFiles(files)
    }
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [openFiles])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TopBar />
      <TabBar />
      {doc && <Toolbar />}
      {error && <Banner kind="error" text={error} onDismiss={dismissError} />}
      {note.kind && <Banner kind={note.kind} text={note.text} onDismiss={note.dismiss} action={note.action} />}
      {notice && <Banner kind="info" text={notice} onDismiss={dismissNotice} />}
      <main className="relative flex min-h-0 flex-1">
        <Suspense fallback={<div role="status" className="grid flex-1 place-items-center text-muted">Loading viewer…</div>}>
          {doc && sidebarOpen && (
            <>
              <button type="button" aria-label="Close sidebar" tabIndex={-1} onClick={() => toggleSidebar()} className="absolute inset-0 z-10 bg-black/40 md:hidden" />
              <Sidebar />
            </>
          )}
          <div className="min-w-0 flex-1">{doc ? <Viewer key={docId ?? fileName} doc={doc} /> : <EmptyState />}</div>
          {doc && <PropertiesPanel />}
        </Suspense>
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-20 grid place-items-center rounded-xl border-2 border-dashed border-accent bg-accent-soft/80 text-lg font-medium backdrop-blur-[1px]">
            Drop PDFs to open them
          </div>
        )}
      </main>
      <StatusBar />
      <PasswordDialog />
      <CombineDialog />
      <Suspense fallback={null}>
      {doc && dialog === 'signature' && <SignatureDialog />}
      {doc && dialog === 'pages' && <PageManagerDialog />}
      {doc && dialog === 'export' && <ExportDialog mode="export" />}
      {doc && dialog === 'print' && <ExportDialog mode="print" />}
      {doc && dialog === 'ocr' && <OcrDialog />}
      {doc && dialog === 'info' && <InfoDialog />}
      {doc && dialog === 'unlock' && <UnlockDialog />}
      {doc && dialog === 'images' && <ImagesDialog />}
      {doc && dialog === 'compare' && <CompareDialog />}
      {doc && dialog === 'annotations' && <AnnotationIoDialog />}
      {dialog === 'storage' && <StorageDialog />}
      {!doc && dialog && dialog !== 'storage' && (void closeDialog(), null)}
      </Suspense>
    </div>
  )
}
