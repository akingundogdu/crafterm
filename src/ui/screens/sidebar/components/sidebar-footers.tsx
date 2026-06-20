import type { SidebarFootersDeps } from './sidebar-footers.types'

// The five per-mode sidebar footer button bars (terminal / notebook / database /
// docker / accounts). Built into `#sidebar` after the tab list. Exactly one shows
// at a time — `display` is owned by the `#app.mode-*` rules in sidebar.css, so the
// markup keeps the original ids and default display state untouched.
//
// Action handlers are injected by the main-window bootstrap so this component does
// not import the command/view modules directly (avoids import cycles). The
// accounts footer's buttons are wired separately by the accounts module
// (`initAccounts`) once this markup exists.
export function mountSidebarFooters(host: HTMLElement, deps: SidebarFootersDeps): void {
  const terminalFooter = (
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

  const notebookFooter = (
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
      <button id="nb-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement

  const databaseFooter = (
    <div id="database-footer">
      <button id="db-new-project" title="New database project" onClick={deps.onDatabaseNewProject}>
        <span class="btn-label">+ Project</span>
      </button>
      <button id="db-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement

  const dockerFooter = (
    <div id="docker-footer">
      <button id="docker-refresh" title="Refresh docker view" onClick={deps.onDockerRefresh}>
        <span class="btn-label">⟳ Refresh</span>
      </button>
      <button id="docker-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement

  const accountsFooter = (
    <div id="accounts-footer">
      <button id="accounts-new-entry" title="New account">
        <span class="btn-label">+ Account</span>
      </button>
      <button id="accounts-new-secret" title="New secret (env var)">
        <span class="btn-label">+ Secret</span>
      </button>
      <button id="accounts-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" />
    </div>
  ) as HTMLDivElement

  host.append(terminalFooter, notebookFooter, databaseFooter, dockerFooter, accountsFooter)
}
