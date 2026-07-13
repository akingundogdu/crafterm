import { Component } from '@geajs/core'
import type { CollectedProcess } from '@services/bgproc'

export interface DeviceAppRowProps {
  item: CollectedProcess
  onStop: (e: MouseEvent) => void
}

// One Crafterm iOS run on a target: title + cwd subtitle and a "Stop app" action.
// Rendered as a JSX child of the devices list, so gea populates `this.props`. The
// iosService/bgproc teardown + refresh stay in the parent, passed in as an
// already-bound handler. Self-contained — no @ui.
export default class DeviceAppRow extends Component {
  declare props: DeviceAppRowProps

  template({ item, onStop }: this['props']) {
    const p = item.proc
    return (
      <div class="pick-row worktree-row">
        <div class="claude-main">
          <span class="claude-title">{p.title}</span>
          <span class="claude-sub">{p.cwd}</span>
        </div>
        <button class="worktree-action worktree-remove" onClick={onStop}>
          Stop app
        </button>
      </div>
    )
  }
}
