import './code-pane.css'
import { codePanes, uid } from '@ui/state/state'
import { setupPaneDnd } from '@ui/pane/pane'
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

  const body = (<div class="diff-body code-body" />) as HTMLDivElement
  const el = (
    <div class="pane-box diff-pane code-pane" dataset={{ paneId: id }} onMousedown={makeSelectPane(id)}>
      {body}
    </div>
  ) as HTMLDivElement

  new CodePaneController(id, { el, body }, opts)

  setupPaneDnd(el, el.querySelector('.pane-header') as HTMLElement, id)

  return id
}

export function destroyCodePane(id: string): void {
  runCodePaneCleanup(id)
  codePanes.delete(id)
}
