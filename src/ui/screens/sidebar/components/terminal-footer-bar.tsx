import type { SidebarFootersDeps } from './sidebar-footers.types'

// Terminal-mode footer bar: new terminal / Claude / folder / project + settings.
export function terminalFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
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
      <button id="settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement
}
