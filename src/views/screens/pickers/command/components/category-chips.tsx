import { Component } from '@geajs/core'

export interface CategoryChipProps {
  category: string
  active: boolean
  onToggle: (category: string) => void
}

// One palette category chip in the multi-select segmented control. Rendered as a
// keyed JSX child of the palette view; the active state is driven by the store's
// `active` Set (reassigned on toggle), so gea re-renders the chip on every toggle —
// the daily-compact tabs pattern (active via inline conditional class).
export default class CategoryChip extends Component {
  declare props: CategoryChipProps

  template({ category, active, onToggle }: this['props']) {
    return (
      <button class={'picker-markdown-chip' + (active ? ' active' : '')} onClick={() => onToggle(category)}>
        {category}
      </button>
    )
  }
}
