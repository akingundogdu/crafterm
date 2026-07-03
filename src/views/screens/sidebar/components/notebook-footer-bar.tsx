import { Component } from '@geajs/core'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Notebook-mode footer bar: new note / folder / link external file + settings. Static
// per render — the sidebar rebuilds the footers wholesale on refresh — so no store
// subscription is needed. Handlers arrive via the constructor into a plain field,
// because a gea Component only populates `this.props` when rendered from a parent
// template, not from a manual `new X()`.
export default class NotebookFooterBar extends Component {
  private readonly deps: SidebarFootersDeps

  constructor(opts: { deps: SidebarFootersDeps }) {
    super()
    this.deps = opts.deps
  }

  template() {
    const { deps } = this
    return (
      <div id="notebook-footer">
        <button id="nb-new-note" title="New note (⌘N)" onClick={deps.onNotebookNewNote}>
          <span class="btn-label">Note</span>
          <span class="kbd">⌘N</span>
        </button>
        <button id="nb-new-folder" title="New folder (⇧⌘N)" onClick={deps.onNotebookNewFolder}>
          <span class="btn-label">Folder</span>
          <span class="kbd">⇧⌘N</span>
        </button>
        <button id="nb-link-file" title="Link an external file to the notebook" onClick={deps.onNotebookLinkFile}>
          <span class="btn-label">Link</span>
        </button>
        <button id="nb-settings-btn" title="Settings (⌘,)" onClick={deps.onSettings}>⚙</button>
      </div>
    )
  }
}

// Builds the notebook footer element for the sidebar to insert. Signature preserved
// so the sidebar-footers consumer resolves unchanged.
export function notebookFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  const host = document.createElement('div')
  new NotebookFooterBar({ deps }).render(host)
  return host.firstElementChild as HTMLDivElement
}
