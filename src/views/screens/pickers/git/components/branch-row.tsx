import { Component } from '@geajs/core'

export interface BranchRowProps {
  branch: string
  isActive: boolean
  onSelect: () => void
  onHover: () => void
}

// One branch row in the checkout list. Its active highlight comes from an inline
// conditional class driven by the store's `sel` index (the parent list re-renders
// on every arrow-key nav / hover). Rendered as a JSX child so gea populates
// `this.props`. Self-contained.
export default class BranchRow extends Component {
  declare props: BranchRowProps

  template({ branch, isActive, onSelect, onHover }: this['props']) {
    return (
      <div class={'pick-row' + (isActive ? ' active' : '')} onClick={onSelect} onMouseEnter={onHover}>
        <span class="picker-name">{branch}</span>
      </div>
    )
  }
}
