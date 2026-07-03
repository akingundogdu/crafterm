import { Component } from '@geajs/core'

export interface ChipRowProps {
  name: string
  removeTitle: string
  onRemove: () => void
}

// One environment/group chip: the name plus a small `×` remove button. Rendered as
// a keyed `.map()` item root (a child Component), so the remove handler lives inside
// this template rather than on a nested element in the parent's map (§gea plugin
// keyed-map handler bug). The `×` is a text child, not an HTML entity.
export default class ChipRow extends Component {
  declare props: ChipRowProps

  template({ name, removeTitle, onRemove }: this['props']) {
    return (
      <span class="settings-env-chip">
        <span>{name}</span>
        <button class="env-chip-x" title={removeTitle} onClick={onRemove}>
          {'×'}
        </button>
      </span>
    )
  }
}
