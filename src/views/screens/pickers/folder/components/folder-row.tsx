import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface FolderRowProps {
  name: string
  isActive: boolean
  onSelect: () => void
  onDrill: () => void
  onHover: () => void
}

// One folder row: the folder name plus a drill-into (`›`) button. Rendered as a
// keyed JSX child of the list, so gea populates `this.props`. Selection index, list
// state, and navigation stay in the parent, passed in as already-bound handlers.
export default class FolderRow extends Component {
  declare props: FolderRowProps

  template({ name, isActive, onSelect, onDrill, onHover }: this['props']) {
    return (
      <div class={'pick-row picker-row' + (isActive ? ' active' : '')} onClick={onSelect} onMouseEnter={onHover}>
        <span class="picker-name">{name}</span>
        <button
          class="picker-drill"
          title={UITexts.Pickers.folder.enterFolder}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            onDrill()
          }}
        >
          ›
        </button>
      </div>
    )
  }
}
