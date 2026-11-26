import {
  ArrowUpRight, Circle, FormInput, ImagePlus, Link2, Eraser, Hand, Highlighter, MousePointer2, Pen, PenLine, ScanLine, Square, StickyNote,
  SlidersHorizontal, Stamp, Strikethrough, TextCursorInput, Type, Underline, Minus,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { pickImageToPlace } from '../../lib/annotations/pickImage'
import { useTools } from '../../stores/tools'
import type { Tool } from '../../stores/tools'
import { useUI } from '../../stores/ui'
import { useViewer } from '../../stores/viewer'
import { IconButton } from '../common/IconButton'

type ToolDef = { tool: Tool; label: string; icon: LucideIcon }

/** Groups are separated in the strip so the 17 tools scan as six clusters instead of one row. */
const GROUPS: ToolDef[][] = [
  [
    { tool: 'select', label: 'Select / move annotations', icon: MousePointer2 },
    { tool: 'hand', label: 'Hand (scroll and select text)', icon: Hand },
  ],
  [
    { tool: 'highlight', label: 'Highlight text', icon: Highlighter },
    { tool: 'underline', label: 'Underline text', icon: Underline },
    { tool: 'strikethrough', label: 'Strikethrough text', icon: Strikethrough },
  ],
  [
    { tool: 'freehand', label: 'Freehand drawing', icon: Pen },
    { tool: 'text', label: 'Text box', icon: Type },
    { tool: 'edittext', label: 'Edit existing text (click a line of text)', icon: TextCursorInput },
  ],
  [
    { tool: 'note', label: 'Sticky note', icon: StickyNote },
    { tool: 'rectangle', label: 'Rectangle', icon: Square },
    { tool: 'ellipse', label: 'Ellipse', icon: Circle },
    { tool: 'line', label: 'Line', icon: Minus },
    { tool: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  ],
  [
    { tool: 'stamp', label: 'Stamp', icon: Stamp },
    { tool: 'signature', label: 'Signature', icon: PenLine },
    { tool: 'image', label: 'Add image', icon: ImagePlus },
    { tool: 'link', label: 'Link (drag an area)', icon: Link2 },
    { tool: 'field', label: 'Form field (drag an area)', icon: FormInput },
  ],
  [
    { tool: 'redact', label: 'Mark area for redaction', icon: ScanLine },
    { tool: 'eraser', label: 'Eraser (click an annotation)', icon: Eraser },
  ],
]

export function Toolbar() {
  const doc = useViewer((s) => s.doc)
  const tool = useTools((s) => s.tool)
  const setTool = useTools((s) => s.setTool)
  const openDialog = useUI((s) => s.open)
  const propsOpen = useUI((s) => s.propsOpen)
  const toggleProps = useUI((s) => s.toggleProps)
  const disabled = !doc
  return (
    <div className="flex shrink-0 items-center border-b border-border bg-surface">
      <div role="toolbar" aria-label="Editing tools" className="scroll-strip flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-1">
        {GROUPS.map((group, gi) => (
          <div key={gi} role="group" className="flex shrink-0 items-center gap-0.5 border-border not-first:ml-1 not-first:border-l not-first:pl-1">
            {group.map((t) => (
              <IconButton
                key={t.tool}
                icon={t.icon}
                label={t.label}
                active={tool === t.tool}
                disabled={disabled}
                onClick={() => (t.tool === 'signature' ? openDialog('signature') : t.tool === 'image' ? pickImageToPlace() : setTool(t.tool))}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="shrink-0 border-l border-border px-1 py-1 lg:hidden">
        <IconButton icon={SlidersHorizontal} label="Tool properties" aria-expanded={propsOpen} active={propsOpen} disabled={disabled} onClick={toggleProps} />
      </div>
    </div>
  )
}
