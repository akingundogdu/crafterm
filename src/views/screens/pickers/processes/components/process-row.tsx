import { Component } from '@geajs/core'
import type { CollectedProcess } from '@services/bgproc'
import { PROC_STATUS_LABEL } from '../processes.store'

export interface ProcessRowProps {
  item: CollectedProcess
  onView: (e: MouseEvent) => void
  onKill: (e: MouseEvent) => void
}

// One tracked background process: title + target/cwd subtitle, a status pill, and
// view / kill actions. Rendered as a JSX child of the list, so gea populates
// `this.props`. The bgproc mutations + refresh stay in the parent, passed in as
// already-bound handlers. Self-contained — no @ui.
export default class ProcessRow extends Component {
  declare props: ProcessRowProps

  template({ item, onView, onKill }: this['props']) {
    const p = item.proc
    return (
      <div class="pick-row worktree-row">
        <div class="claude-main">
          <span class="claude-title">{p.title}</span>
          <span class="claude-sub">{[p.target?.name, p.cwd].filter(Boolean).join(' · ')}</span>
        </div>
        <span class={'proc-status proc-status-' + p.status}>
          {PROC_STATUS_LABEL[p.status] ?? p.status}
        </span>
        <button class="worktree-action" onClick={onView}>
          View
        </button>
        <button class="worktree-action worktree-remove" onClick={onKill}>
          Kill
        </button>
      </div>
    )
  }
}
