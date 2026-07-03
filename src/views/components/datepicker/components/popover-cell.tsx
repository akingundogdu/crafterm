import { Component } from '@geajs/core'
import type { DayCell } from '../datepicker.types'

// One calendar day button: muted / today / selected classes + a click that selects
// the day. Pure presentational JSX child — its flags are computed by the grid (which
// reads the reactive store) and handed in via props.
export default class PopoverCell extends Component {
  declare props: { cell: DayCell; isSelected: boolean; onPick: () => void }

  template({ cell, isSelected, onPick }: this['props']) {
    let cls = 'datepicker-pop-cell'
    if (cell.muted) cls += ' datepicker-pop-cell-muted'
    if (cell.today) cls += ' datepicker-pop-cell-today'
    if (isSelected) cls += ' datepicker-pop-cell-selected'
    return (
      <button class={cls} onClick={onPick}>
        {String(cell.d)}
      </button>
    )
  }
}
