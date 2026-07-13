import { Component } from '@geajs/core'
import './palette-row.css'
import type { PaletteCommand } from '../command.types'

export interface PaletteRowProps {
  command: PaletteCommand
  active: boolean
  onClick: () => void
  onHover: () => void
}

// One command palette row: name, an optional distinct value, and the category tag.
// Rendered as a keyed JSX child of the palette list, so gea populates `this.props`;
// selection index and navigation stay in the controller, passed in as bound
// handlers.
export default class PaletteRow extends Component {
  declare props: PaletteRowProps

  template({ command, active, onClick, onHover }: this['props']) {
    const c = command
    return (
      <div class={'pick-row palette-row' + (active ? ' active' : '')} onClick={onClick} onMouseEnter={onHover}>
        <span class="palette-name">{c.name}</span>
        {c.value && c.value !== c.name ? <span class="palette-val">{c.value}</span> : null}
        <span class="palette-cat">{c.category}</span>
      </div>
    )
  }
}
