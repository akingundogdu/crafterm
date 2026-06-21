import type { SidebarFootersDeps } from './sidebar-footers.types'

// Docker-mode footer bar: refresh docker view + settings.
export function dockerFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  return (
    <div id="docker-footer">
      <button id="docker-refresh" title="Refresh docker view" onClick={deps.onDockerRefresh}>
        <span class="btn-label">⟳ Refresh</span>
      </button>
      <button id="docker-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement
}
