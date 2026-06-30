import './code-pane.css'
import { el } from '@views/lib/dom'
import { codePanes, uid } from '@views/state/spine'
import { setupPaneDnd } from '@views/pane/pane'
import type { CreateCodePaneOptions } from './code-pane.types'
import { runCodePaneCleanup, makeSelectPane } from './code-pane.state'
import { CodePaneController } from './code-pane.controller'

export type { CreateCodePaneOptions } from './code-pane.types'

// An editable code editor pane (Monaco) opened from the Files panel.
// Syntax-highlights by file extension, supports Cmd +/- zoom, and saves the
// buffer back to disk on Cmd+S / the Save button. A single pane is reused for
// successive file clicks (openFile). Transient — not persisted.
// This factory builds the static skeleton DOM and hands it to a
// CodePaneController, which builds the header and owns all per-pane state.
export function createCodePane(opts: CreateCodePaneOptions): string {
  const id = uid('cp')

  const body = el('div', { class: 'diff-body code-body' })
  const box = el(
    'div',
    { class: 'pane-box diff-pane code-pane', 'data-pane-id': id, onmousedown: makeSelectPane(id) },
    body
  )

  new CodePaneController(id, { el: box, body }, opts)

  setupPaneDnd(box, box.querySelector('.pane-header') as HTMLElement, id)

  return id
}

export function destroyCodePane(id: string): void {
  runCodePaneCleanup(id)
  codePanes.delete(id)
}
