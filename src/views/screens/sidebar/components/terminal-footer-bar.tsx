import { Component } from '@geajs/core'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Terminal-mode footer bar: new terminal / Claude / folder / project + settings.
// Static per render — the sidebar rebuilds the footers wholesale on refresh — so no
// store subscription is needed. Handlers arrive via the constructor into a plain
// field, because a gea Component only populates `this.props` when rendered from a
// parent template, not from a manual `new X()`.
export default class TerminalFooterBar extends Component {
  private readonly deps: SidebarFootersDeps

  constructor(opts: { deps: SidebarFootersDeps }) {
    super()
    this.deps = opts.deps
  }

  template() {
    const { deps } = this
    return (
      <div id="sidebar-footer">
        <button id="new-tab" title="New terminal (⌘T)" onClick={deps.onNewTerminal}>
          <span class="btn-label">Terminal</span>
          <span class="kbd">⌘T</span>
        </button>
        <button id="new-claude" title="New Claude terminal (⇧⌘T)" onClick={deps.onNewClaude}>
          <span class="btn-label">Claude</span>
          <span class="kbd">⇧⌘T</span>
        </button>
        <button id="new-folder" title="New folder (⇧⌘N)" onClick={deps.onNewFolder}>
          + Folder
        </button>
        <button id="new-project" title="New project" onClick={deps.onNewProject}>
          + Project
        </button>
        <button id="settings-btn" title="Settings (⌘,)" onClick={deps.onSettings}>⚙</button>
      </div>
    )
  }
}

// Builds the terminal footer element for the sidebar to insert. Signature preserved
// so the sidebar-footers consumer resolves unchanged.
export function terminalFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  const host = document.createElement('div')
  new TerminalFooterBar({ deps }).render(host)
  return host.firstElementChild as HTMLDivElement
}
