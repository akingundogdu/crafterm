import { Component } from '@geajs/core'
import { baseName } from '../../shared'
import { ALL_FOLDERS } from '../finders.store'

export interface FilterChipsProps {
  folders: string[]
  active: string | null
  onPick: (value: string) => void
}

// The folder filter chip bar used by both finders: an "All" chip followed by one
// chip per configured folder — a segmented control. The active chip is derived
// from the store's folderFilter (passed in as `active`); each chip hands its value
// back to the parent, which owns the actual load. Rendered as a JSX child so gea
// populates `this.props`.
export default class FilterChips extends Component {
  declare props: FilterChipsProps

  template({ folders, active, onPick }: this['props']) {
    return (
      <div class="md-filters">
        {folders.length ? (
          <button
            class={'picker-markdown-chip' + (active === ALL_FOLDERS ? ' active' : '')}
            title="All configured folders"
            onClick={() => onPick(ALL_FOLDERS)}
          >
            All
          </button>
        ) : null}
        {folders.map((f) => (
          <button
            key={f}
            class={'picker-markdown-chip' + (active === f ? ' active' : '')}
            title={f}
            onClick={() => onPick(f)}
          >
            {baseName(f)}
          </button>
        ))}
      </div>
    )
  }
}
