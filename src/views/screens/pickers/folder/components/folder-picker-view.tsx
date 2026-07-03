import { Component } from '@geajs/core'
import type { DirEntry } from '@services/fs/fs.types'
import { filterDirs } from '../folder.state'
import store from '../folder.store'
import FolderRow from './folder-row'

// The chrome + behaviour the picker-view needs, supplied by whichever controller
// mounts it. `showUse` toggles the "pick a folder" variant's confirm button; the
// handlers close over the controller's async load / navigation / resolve state.
export interface FolderPickerDeps {
  placeholder: string
  showUse: boolean
  onUse: () => void
  onSelect: (dir: DirEntry) => void
  onDrill: (dir: DirEntry) => void
  onHover: (index: number) => void
  onKeyDown: (e: KeyboardEvent) => void
}

// Reactive body of the folder picker: current path, the optional confirm button,
// the search box, and the live-filtered directory list. Rendered as a JSX child of
// FolderPickerView so gea tracks its store reads and re-renders it on every search
// keystroke, directory load, or selection change (arrow-key nav / hover) — the
// board pattern. A top-level, imperatively mounted component (FolderPickerView)
// does not re-subscribe on store writes, so all reactive markup lives here.
class FolderList extends Component {
  declare props: { deps: FolderPickerDeps }

  template({ deps }: this['props']) {
    // Subscribe to the reactive store fields so this child re-renders on any search
    // keystroke, load, or selection change.
    void store.rev
    const { path, search, sel } = store
    const items = filterDirs(store.dirs, search)

    return (
      <div class="folder-picker">
        <div class="picker-path">{path}</div>
        {deps.showUse && (
          <button class="settings-inline-btn" onClick={deps.onUse}>
            Use this folder
          </button>
        )}
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder={deps.placeholder}
          value={search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
          onKeyDown={deps.onKeyDown}
        />
        <div class="pick-list picker-list">
          {items.map((d, i) => (
            <FolderRow
              key={d.path}
              name={d.name}
              isActive={i === sel}
              onSelect={() => deps.onSelect(d)}
              onDrill={() => deps.onDrill(d)}
              onHover={() => deps.onHover(i)}
            />
          ))}
          {items.length === 0 && <div class="empty-hint">No folders</div>}
        </div>
      </div>
    )
  }
}

// Thin shell for the folder picker, mounted imperatively into the shared overlay
// modal. `deps` arrive via the constructor into a plain field — a gea Component only
// populates `this.props` when rendered from a parent template, not from a manual
// `new X()`. The reactive markup lives in the FolderList JSX child.
export default class FolderPickerView extends Component {
  private readonly deps: FolderPickerDeps

  constructor(deps: FolderPickerDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <FolderList deps={this.deps} />
  }
}
