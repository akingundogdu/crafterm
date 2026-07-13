import { Component } from '@geajs/core'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Database-mode footer bar: new database project + settings. Static per render — the
// sidebar rebuilds the footers wholesale on refresh — so no store subscription is
// needed. Handlers arrive via the constructor into a plain field, because a gea
// Component only populates `this.props` when rendered from a parent template, not
// from a manual `new X()`.
export default class DatabaseFooterBar extends Component {
  private readonly deps: SidebarFootersDeps

  constructor(opts: { deps: SidebarFootersDeps }) {
    super()
    this.deps = opts.deps
  }

  template() {
    const { deps } = this
    return (
      <div id="database-footer">
        <button id="db-new-project" title="New database project" onClick={deps.onDatabaseNewProject}>
          <span class="btn-label">+ Project</span>
        </button>
        <button id="db-settings-btn" title="Settings (⌘,)" onClick={deps.onSettings}>⚙</button>
      </div>
    )
  }
}

// Builds the database footer element for the sidebar to insert. Signature preserved
// so the sidebar-footers consumer resolves unchanged.
export function databaseFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  const host = document.createElement('div')
  new DatabaseFooterBar({ deps }).render(host)
  return host.firstElementChild as HTMLDivElement
}
