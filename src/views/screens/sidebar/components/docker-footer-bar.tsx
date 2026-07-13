import { Component } from '@geajs/core'
import type { SidebarFootersDeps } from './sidebar-footers.types'

// Docker-mode footer bar: refresh docker view + settings. Static per render — the
// sidebar rebuilds the footers wholesale on refresh — so no store subscription is
// needed. Handlers arrive via the constructor into a plain field, because a gea
// Component only populates `this.props` when rendered from a parent template, not
// from a manual `new X()`.
export default class DockerFooterBar extends Component {
  private readonly deps: SidebarFootersDeps

  constructor(opts: { deps: SidebarFootersDeps }) {
    super()
    this.deps = opts.deps
  }

  template() {
    const { deps } = this
    return (
      <div id="docker-footer">
        <button id="docker-refresh" title="Refresh docker view" onClick={deps.onDockerRefresh}>
          <span class="btn-label">⟳ Refresh</span>
        </button>
        <button id="docker-settings-btn" title="Settings (⌘,)" onClick={deps.onSettings}>⚙</button>
      </div>
    )
  }
}

// Builds the docker footer element for the sidebar to insert. Signature preserved so
// the sidebar-footers consumer resolves unchanged.
export function dockerFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  const host = document.createElement('div')
  new DockerFooterBar({ deps }).render(host)
  return host.firstElementChild as HTMLDivElement
}
