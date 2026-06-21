import type { PlanItem } from '../notebook.types'
import { NOTE_SVG, MD_RE, stopAnd } from '../notebook.state'

// A single plan list item with its hover actions. Pure factory: the action
// handlers are injected so this module stays free of IPC/command imports.

interface PlanRowActions {
  onOpen: (path: string) => void
  onRemind: (p: PlanItem) => void
  onReveal: (path: string) => void
}

function actBtn(text: string, title: string, fn: (e: Event) => void): HTMLButtonElement {
  return (
    <button class="notebook-action" title={title} onClick={fn}>
      {text}
    </button>
  ) as HTMLButtonElement
}

export function buildPlanRow(p: PlanItem, a: PlanRowActions): HTMLElement {
  const actions = (<span class="nb-actions" />) as HTMLSpanElement
  actions.append(
    actBtn('⏰', 'Remind me', stopAnd(() => a.onRemind(p))),
    actBtn('⤴', 'Show in Finder', stopAnd(() => a.onReveal(p.path)))
  )
  const row = (
    <div class="tab-item nb-linked-row" title={p.path} onClick={() => a.onOpen(p.path)}>
      <div class="tab-row">
        <span class="folder-icon" innerHTML={NOTE_SVG} />
        <span class="tab-title">{p.name.replace(MD_RE, '')}</span>
        {actions}
      </div>
    </div>
  ) as HTMLDivElement
  return row
}
