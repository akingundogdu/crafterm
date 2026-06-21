import type { SidebarFootersDeps } from './sidebar-footers.types'

// Notebook-mode footer bar: new note / folder / link external file + settings.
export function notebookFooterBar(deps: SidebarFootersDeps): HTMLDivElement {
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
      <button id="nb-settings-btn" title="Settings (⌘,)" innerHTML="&#9881;" onClick={deps.onSettings} />
    </div>
  ) as HTMLDivElement
}
