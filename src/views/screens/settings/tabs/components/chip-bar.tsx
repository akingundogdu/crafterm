import { Component } from '@geajs/core'
import ChipRow from './chip-row'

export interface ChipBarDeps {
  names: string[]
  removeTitle: string
  addLabel: string
  onRemove: (name: string) => void
  onAdd: () => void
}

// The environment / group chip strip: one ChipRow per name plus a "+ …" add button.
// Rendered as a reactive JSX child (EnvChips / GroupChips), so its data arrives via
// props; its display:contents root lets the chips + button lay out as direct children
// of the `.env-bar` (§gea 5.8), matching the legacy DOM. Rebuilt on every parent
// re-render, so the keyed `.map()` re-materializes fresh.
export default class ChipBar extends Component {
  declare props: ChipBarDeps

  template() {
    const { names, removeTitle, addLabel, onRemove, onAdd } = this.props
    return (
      <div style={{ display: 'contents' }}>
        {names.map((name) => (
          <ChipRow key={name} name={name} removeTitle={removeTitle} onRemove={() => onRemove(name)} />
        ))}
        <button class="settings-inline-btn env-add" onClick={onAdd}>
          {addLabel}
        </button>
      </div>
    )
  }
}
