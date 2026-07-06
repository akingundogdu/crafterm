import './code-pane.css'
import { Component } from '@geajs/core'
import { codePanes, uid } from '@views/state/spine'
import { setupPaneDnd } from '@views/pane/pane'
import type { CreateCodePaneOptions } from './code-pane.types'
import { runCodePaneCleanup, makeSelectPane } from './code-pane.state'
import { CodePaneController } from './code-pane.controller'

export type { CreateCodePaneOptions } from './code-pane.types'

// The pane-box shell for a code pane. A thin gea shell that owns the box + an
// empty `.diff-body.code-body` host; the CodePaneController then prepends its
// header and mounts Monaco into that host (both imperative). The header is a
// pre-built node (appended by the controller) — embedding it via a `{expr}` JSX
// child would render an empty comment under gea.
class CodePaneBox extends Component {
  private readonly paneId: string
  private readonly onSelect: (e: MouseEvent) => void

  constructor(opts: { id: string; onSelect: (e: MouseEvent) => void }) {
    super()
    this.paneId = opts.id
    this.onSelect = opts.onSelect
  }

  template() {
    return (
      <div class="pane-box diff-pane code-pane" data-pane-id={this.paneId} onMouseDown={this.onSelect}>
        <div class="diff-body code-body" />
      </div>
    )
  }
}

// An editable code editor pane (Monaco) opened from the Files panel.
// Syntax-highlights by file extension, supports Cmd +/- zoom, and saves the
// buffer back to disk on Cmd+S / the Save button. A single pane is reused for
// successive file clicks (openFile). Transient — not persisted.
// This factory builds the box shell (gea) and hands its `.diff-body` host to a
// CodePaneController, which builds the header and owns the imperative Monaco
// lifecycle.
export function createCodePane(opts: CreateCodePaneOptions): string {
  const id = uid('cp')

  const boxHost = document.createElement('div')
  new CodePaneBox({ id, onSelect: makeSelectPane(id) }).render(boxHost)
  const box = boxHost.firstElementChild as HTMLDivElement
  const body = box.querySelector('.diff-body') as HTMLDivElement

  new CodePaneController(id, { el: box, body }, opts)

  setupPaneDnd(box, box.querySelector('.pane-header') as HTMLElement, id)

  return id
}

export function destroyCodePane(id: string): void {
  runCodePaneCleanup(id)
  codePanes.delete(id)
}
