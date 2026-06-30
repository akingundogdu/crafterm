import { el } from '@views/lib/dom'
import type { CollectedProcess } from '@services/bgproc'
import { PROC_STATUS_LABEL } from '../processes.state'

interface ProcessRowProps {
  item: CollectedProcess
  onView: (e: MouseEvent) => void
  onKill: (e: MouseEvent) => void
}

export function processRow({ item, onView, onKill }: ProcessRowProps): HTMLDivElement {
  return el(
    'div',
    { class: 'pick-row worktree-row' },
    el(
      'div',
      { class: 'claude-main' },
      el('span', { class: 'claude-title' }, item.proc.title),
      el('span', { class: 'claude-sub' }, [item.proc.target?.name, item.proc.cwd].filter(Boolean).join(' · '))
    ),
    el(
      'span',
      { class: 'proc-status proc-status-' + item.proc.status },
      PROC_STATUS_LABEL[item.proc.status] ?? item.proc.status
    ),
    el('button', { class: 'worktree-action', onClick: onView }, 'View'),
    el('button', { class: 'worktree-action worktree-remove', onClick: onKill }, 'Kill')
  )
}
