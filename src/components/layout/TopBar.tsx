import {
  Download, FileDiff, LockOpen, FileJson, Images, FileText, FolderOpen, HardDrive, Info, Maximize2, Moon, PanelLeft, Printer, Redo2, RotateCw, ScanText, Search, StretchHorizontal, Sun, Undo2, X, LayoutGrid, Tags,
} from 'lucide-react'
import { useStore } from 'zustand'
import { useSaveState } from '../../lib/autosave'
import { useInstall } from '../../pwa'
import { closeDocument } from '../../lib/session'
import { useDocument } from '../../stores/document'
import { pickPdf } from '../../stores/opener'
import { useTheme } from '../../stores/theme'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { IconButton } from '../common/IconButton'
import { Menu } from '../common/Menu'

function SaveStatus() {
  const { status, error } = useSaveState()
  const dirty = useDocument((s) => s.dirty)
  const text = status === 'error' ? `Not saved: ${error}` : status === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved on this device'
  return <span role="status" className={`hidden truncate text-xs md:inline ${status === 'error' ? 'text-red-600' : 'text-muted'}`} title={text}>{text}</span>
}

export function TopBar() {
  const { doc, fileName, sidebarOpen, sidebarTab, toggleSidebar } = useViewer()
  const { theme, toggle } = useTheme()
  const open = useUI((s) => s.open)
  const past = useStore(useDocument.temporal, (s) => s.pastStates.length)
  const future = useStore(useDocument.temporal, (s) => s.futureStates.length)
  const hasDoc = !!doc
  const encrypted = useDocument((s) => s.encrypted)
  const install = useInstall((s) => s.event)
  const { setZoomMode, rotate } = useViewer.getState()

  return (
    <header className="flex h-12 shrink-0 items-center gap-0.5 border-b border-border bg-surface pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] box-content sm:gap-1">
      <span className="mr-2 hidden items-center gap-1.5 font-semibold lg:flex"><FileText size={18} className="text-accent" aria-hidden /> TVR-PDF</span>
      <IconButton icon={FolderOpen} label="Open PDF (Ctrl/Cmd+O)" onClick={pickPdf} />
      <IconButton icon={PanelLeft} label="Toggle sidebar" active={sidebarOpen} disabled={!hasDoc} onClick={() => toggleSidebar()} />
      <IconButton icon={Search} label="Search (Ctrl/Cmd+F)" className="max-sm:hidden" active={sidebarOpen && sidebarTab === 'search'} disabled={!hasDoc} onClick={() => toggleSidebar('search')} />
      <div className="mx-1 flex min-w-0 flex-1 flex-col items-center leading-tight sm:mx-2">
        <span className="max-w-full truncate text-[13px] font-medium sm:text-sm" title={fileName}>{fileName}</span>
        {hasDoc && <SaveStatus />}
      </div>
      <IconButton icon={Undo2} label="Undo (Ctrl/Cmd+Z)" disabled={!hasDoc || !past} onClick={() => useDocument.getState().undo()} />
      <IconButton icon={Redo2} label="Redo (Ctrl/Cmd+Shift+Z)" disabled={!hasDoc || !future} onClick={() => useDocument.getState().redo()} />
      <IconButton icon={Download} label="Export PDF" disabled={!hasDoc} onClick={() => open('export')} />
      <IconButton icon={FileJson} label="Import / export annotations" className="max-sm:hidden" disabled={!hasDoc} onClick={() => open('annotations')} />
      <IconButton icon={theme === 'dark' ? Sun : Moon} label="Toggle dark mode" className="max-sm:hidden" onClick={toggle} />
      <Menu
        items={[
          { label: 'Search in document', icon: <Search size={14} />, disabled: !hasDoc, compactOnly: true, onSelect: () => toggleSidebar('search') },
          { label: 'Fit to width', icon: <StretchHorizontal size={14} />, disabled: !hasDoc, compactOnly: true, onSelect: () => setZoomMode('fit-width') },
          { label: 'Fit to page', icon: <Maximize2 size={14} />, disabled: !hasDoc, compactOnly: true, onSelect: () => setZoomMode('fit-page') },
          { label: 'Rotate view', icon: <RotateCw size={14} />, disabled: !hasDoc, compactOnly: true, onSelect: () => rotate() },
          { label: theme === 'dark' ? 'Light mode' : 'Dark mode', icon: theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />, compactOnly: true, onSelect: toggle },
          { label: 'Import / export annotations…', icon: <FileJson size={14} />, disabled: !hasDoc, compactOnly: true, onSelect: () => open('annotations') },
          { label: 'Organize pages…', icon: <LayoutGrid size={14} />, disabled: !hasDoc, onSelect: () => open('pages') },
          { label: 'Recognize text (OCR)…', icon: <ScanText size={14} />, disabled: !hasDoc, onSelect: () => open('ocr') },
          { label: 'Form fields', icon: <Tags size={14} />, disabled: !hasDoc, onSelect: () => toggleSidebar('forms') },
          { label: 'Unlock for editing…', icon: <LockOpen size={14} />, disabled: !encrypted, onSelect: () => open('unlock') },
          { label: 'Export pages as images…', icon: <Images size={14} />, disabled: !hasDoc, onSelect: () => open('images') },
          { label: 'Compare with another PDF…', icon: <FileDiff size={14} />, disabled: !hasDoc, onSelect: () => open('compare') },
          { label: 'Print…', icon: <Printer size={14} />, disabled: !hasDoc, onSelect: () => open('print') },
          { label: 'Document properties', icon: <Info size={14} />, disabled: !hasDoc, onSelect: () => open('info') },
          ...(install ? [{ label: 'Install app', icon: <Download size={14} />, onSelect: () => void install.prompt() }] : []),
          { label: 'Storage and privacy…', icon: <HardDrive size={14} />, onSelect: () => open('storage') },
          { label: 'Close document', icon: <X size={14} />, disabled: !hasDoc, onSelect: () => void closeDocument() },
        ]}
      />
    </header>
  )
}
