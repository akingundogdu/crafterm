import { Component } from '@geajs/core'
import type { DirEntry } from '@services/fs/fs.types'
import { planTitle } from '../plans.store'

export interface PlansRowProps {
  plan: DirEntry
  isActive: boolean
  onChoose: () => void
  onHover: () => void
}

// One plan row: the plan's title, activatable by click and highlighted while the
// keyboard/hover selection points at it. Rendered as a JSX child of the list, so
// gea populates `this.props`. The open action + selection updates stay in the
// parent, passed in as already-bound handlers. Self-contained — no @ui.
export default class PlansRow extends Component {
  declare props: PlansRowProps

  template({ plan, isActive, onChoose, onHover }: this['props']) {
    return (
      <button class={'pick-row' + (isActive ? ' active' : '')} onClick={onChoose} onMouseEnter={onHover}>
        {planTitle(plan)}
      </button>
    )
  }
}
