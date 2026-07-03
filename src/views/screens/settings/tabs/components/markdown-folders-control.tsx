import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { promptText } from '@views/components/dialog/prompt-text'
import store from '../commands.store'
import { prettyMdPath, removeMdFolder, addMdFolder } from '../commands.state'
import MarkdownFolderRow from './markdown-folder-row'

interface FolderItem {
  key: string
  path: string
  onDelete: () => void
}

// Reactive markdown-folders body: heading, hint, the folder rows, and "+ Add folder".
// Reads store.mdFolders so gea re-renders it after an add / delete. Rendered as a JSX
// child of MarkdownFoldersControl (the imperatively mounted shell does not re-subscribe
// on store writes — the ssh.tsx board pattern). Delete handlers are built per index in a
// plain loop and passed as props to the row Component (never as `onX` on a nested mapped
// element). DOM order (list before the add button) mirrors the legacy control exactly.
// Self-contained — no @ui.
class MarkdownFoldersList extends Component {
  private add = async (): Promise<void> => {
    const picked = await promptText({
      title: UITexts.Settings.commands.addFolder,
      label: UITexts.Settings.commands.markdownFolders,
      placeholder: '~/path/to/folder',
      confirmText: UITexts.Settings.commands.addFolder
    })
    const path = (picked ?? '').trim()
    if (path && addMdFolder(path)) store.reloadFolders()
  }

  private items(folders: string[]): FolderItem[] {
    return folders.map((path, idx) => ({
      key: `${idx}:${path}`,
      path,
      onDelete: () => {
        removeMdFolder(idx)
        store.reloadFolders()
      }
    }))
  }

  template() {
    const folders = store.mdFolders
    const items = this.items(folders)
    return (
      <div>
        <h3>{UITexts.Settings.commands.markdownFolders}</h3>
        <div class="field-hint">These folders become the filter chips in the Cmd+O markdown finder.</div>
        <div class="projects-editor">
          {items.map((it) => (
            <MarkdownFolderRow key={it.key} path={it.path} prettyPath={prettyMdPath(it.path)} onDelete={it.onDelete} />
          ))}
          {folders.length === 0 && <div class="field-hint">{UITexts.Settings.commands.noFolders}</div>}
        </div>
        <button class="settings-inline-btn" onClick={() => void this.add()}>
          {UITexts.Settings.commands.addFolder}
        </button>
      </div>
    )
  }
}

// Thin shell mounted imperatively into the sub-tab panel; renders the reactive
// MarkdownFoldersList JSX child so gea tracks its store reads. Self-contained — no @ui.
export default class MarkdownFoldersControl extends Component {
  template() {
    return <MarkdownFoldersList />
  }
}
