import type { CollectedProcess } from '@services/bgproc'
import { PROC_STATUS_LABEL } from '../processes.state'

interface ProcessRowProps {
  item: CollectedProcess
  onView: (e: MouseEvent) => void
  onKill: (e: MouseEvent) => void
}

export function processRow({ item, onView, onKill }: ProcessRowProps): HTMLDivElement {
  return (
    <div class="pick-row worktree-row">
      <div class="claude-main">
        <span class="claude-title">{item.proc.title}</span>
        <span class="claude-sub">{[item.proc.target?.name, item.proc.cwd].filter(Boolean).join(' · ')}</span>
      </div>
      <span class={'proc-status proc-status-' + item.proc.status}>
        {PROC_STATUS_LABEL[item.proc.status] ?? item.proc.status}
      </span>
      <button class="worktree-action" onClick={onView}>
        View
      </button>
      <button class="worktree-action worktree-remove" onClick={onKill}>
        Kill
      </button>
    </div>
  ) as HTMLDivElement
}
