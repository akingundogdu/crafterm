import { el } from '@views/lib/dom'
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
  return el('button', { class: 'notebook-action', title, onClick: fn }, text)
}

export function buildPlanRow(p: PlanItem, a: PlanRowActions): HTMLElement {
  const actions = el(
    'span',
    { class: 'nb-actions' },
    actBtn('⏰', 'Remind me', stopAnd(() => a.onRemind(p))),
    actBtn('⤴', 'Show in Finder', stopAnd(() => a.onReveal(p.path)))
  )
  return el(
    'div',
    { class: 'tab-item nb-linked-row', title: p.path, onClick: () => a.onOpen(p.path) },
    el(
      'div',
      { class: 'tab-row' },
      el('span', { class: 'folder-icon', innerHTML: NOTE_SVG }),
      el('span', { class: 'tab-title' }, p.name.replace(MD_RE, '')),
      actions
    )
  )
}
