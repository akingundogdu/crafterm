import { Component } from '@geajs/core'
import type { StatusBarDeps } from '../status-bar.types'

// Static status-bar chrome (toggles, version chip, usage chip, refresh, notif
// toggle + badge). A gea Component whose subtree is static — no reactive store
// reads — so it never re-renders; chip behavior is wired separately by the
// orchestrator (version-chip / usage-chip) against the ids built here. Namespaced
// SVG icons are applied imperatively in onAfterRender (innerHTML JSX props don't
// work in gea); `deps` arrive via the constructor because a manually mounted gea
// Component does not populate `this.props`.

// SVG namespace icons applied via innerHTML.
const SIDEBAR_TOGGLE_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4" />' +
  '<line x1="6" y1="2.6" x2="6" y2="13.4" stroke="currentColor" stroke-width="1.4" /></svg>'
const NOTIF_TOGGLE_SVG =
  '<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">' +
  '<rect x="1.6" y="2.6" width="12.8" height="10.8" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4" />' +
  '<line x1="10" y1="2.6" x2="10" y2="13.4" stroke="currentColor" stroke-width="1.4" /></svg>'
const USAGE_REFRESH_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">' +
  '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />' +
  '<path d="M13.7 2.2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>'

class StatusBarShell extends Component {
  private readonly deps: StatusBarDeps
  sidebarToggleEl: HTMLElement | null = null
  refreshEl: HTMLElement | null = null
  notifToggleEl: HTMLElement | null = null

  constructor(opts: { deps: StatusBarDeps }) {
    super()
    this.deps = opts.deps
  }

  onAfterRender(): void {
    if (this.sidebarToggleEl) this.sidebarToggleEl.innerHTML = SIDEBAR_TOGGLE_SVG
    if (this.refreshEl) this.refreshEl.innerHTML = USAGE_REFRESH_SVG
    // Prepend (not innerHTML) so the icon lands before the #notif-badge child
    // without clobbering it; guarded so a re-render never duplicates the SVG.
    if (this.notifToggleEl && !this.notifToggleEl.querySelector('svg')) {
      this.notifToggleEl.insertAdjacentHTML('afterbegin', NOTIF_TOGGLE_SVG)
    }
  }

  template() {
    const deps = this.deps
    return (
      <div id="content-statusbar">
        <button
          id="statusbar-sidebar-toggle"
          title="Toggle sidebar (⌘B)"
          aria-label="Toggle sidebar"
          ref={this.sidebarToggleEl}
          onClick={deps.onToggleSidebar}
        />
        <div id="statusbar-resource-chip" />
        <div id="content-statusbar-drag" />
        <button id="statusbar-version" title="App version" aria-label="App version">
          <span class="version-dot" />
          <span class="version-text">v—</span>
        </button>
        <button id="statusbar-claude-usage" title="Claude usage" aria-label="Claude usage">
          <span class="usage-icon">⌬</span>
          <span class="usage-text">—</span>
        </button>
        <button id="statusbar-usage-refresh" title="Refresh usage" aria-label="Refresh usage" ref={this.refreshEl} />
        <button
          id="statusbar-notif-toggle"
          title="Toggle notifications (⌥⌘→)"
          aria-label="Toggle notifications"
          ref={this.notifToggleEl}
          onClick={deps.onToggleNotif}
        >
          <span id="notif-badge" />
        </button>
      </div>
    )
  }
}

// Build the status bar's static DOM and prepend it to the content column. Chip
// behavior is wired separately by the orchestrator. Signature preserved so the
// status-bar.ts entry resolves unchanged.
export function mountStatusBarShell(contentCol: HTMLElement, deps: StatusBarDeps): void {
  const host = document.createElement('div')
  new StatusBarShell({ deps }).render(host)
  contentCol.prepend(host.firstElementChild as HTMLElement)
}
