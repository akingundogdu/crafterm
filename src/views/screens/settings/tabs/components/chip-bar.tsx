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
// Mounted imperatively by the controller into the `.env-bar` host, so its data arrives
// via the constructor and its display:contents root lets the chips + button lay out as
// direct children of the `.env-bar` (§gea 5.8), matching the legacy DOM. Rebuilt one-
// shot on every change, so the keyed `.map()` re-materializes fresh each mount.
export default class ChipBar extends Component {
  private readonly deps: ChipBarDeps

  constructor(deps: ChipBarDeps) {
    super()
    this.deps = deps
  }

  template() {
    const { names, removeTitle, addLabel, onRemove, onAdd } = this.deps
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
