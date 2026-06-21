import type { SidebarFootersDeps } from './sidebar-footers.types'

// Database-mode footer bar: new database project + settings.
export function databaseFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
  return (
    <div id="database-footer">
      <button id="db-new-project" title="New database project" onClick={deps.onDatabaseNewProject}>
        <span class="btn-label">+ Project</span>
      </button>
      <button id="db-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement
}
