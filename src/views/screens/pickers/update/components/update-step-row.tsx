import { Component } from '@geajs/core'
import type { UpdateStepStatus } from '../update.store'

export interface UpdateStepRowProps {
  label: string
  status: UpdateStepStatus
}

// One self-update progress row: a status dot + label. Rendered as a JSX child of
// the list, so gea populates `this.props`. The row is purely presentational — the
// active/done/failed state lives in the reactive update store and arrives via
// `status`, driving the row's modifier class. Self-contained — no @ui.
export default class UpdateStepRow extends Component {
  declare props: UpdateStepRowProps

  template({ label, status }: this['props']) {
    return (
      <div class={'update-step ' + status}>
        <span class="update-dot"></span>
        <span class="update-label">{label}</span>
      </div>
    )
  }
}
