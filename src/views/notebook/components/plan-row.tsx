import { Component } from '@geajs/core'
import type { PlanItem } from '../notebook.types'
import { NOTE_SVG, MD_RE, stopAnd } from '../notebook.state'

// A single plan list item with its hover actions. gea Component: the action
// handlers are injected so this module stays free of IPC/command imports. The
// row is static (no store), so it is safe for the caller to insert the returned
// root into its own list container (rebuilt wholesale on refresh).

interface PlanRowActions {
  onOpen: (path: string) => void
  onRemind: (p: PlanItem) => void
  onReveal: (path: string) => void
}

class PlanRow extends Component {
  private readonly plan: PlanItem
  private readonly actions: PlanRowActions

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(plan: PlanItem, actions: PlanRowActions) {
    super()
    this.plan = plan
    this.actions = actions
  }

  template() {
    const p = this.plan
    const a = this.actions
    return (
      <div class="tab-item nb-linked-row" title={p.path} onClick={() => a.onOpen(p.path)}>
        <div class="tab-row">
          <span class="folder-icon" innerHTML={NOTE_SVG} />
          <span class="tab-title">{p.name.replace(MD_RE, '')}</span>
          <span class="nb-actions">
            <button class="notebook-action" title="Remind me" onClick={stopAnd(() => a.onRemind(p))}>
              ⏰
            </button>
            <button class="notebook-action" title="Show in Finder" onClick={stopAnd(() => a.onReveal(p.path))}>
              ⤴
            </button>
          </span>
        </div>
      </div>
    )
  }
}

export function buildPlanRow(p: PlanItem, a: PlanRowActions): HTMLElement {
  const host = document.createElement('div')
  new PlanRow(p, a).render(host)
  return host.firstElementChild as HTMLElement
}
