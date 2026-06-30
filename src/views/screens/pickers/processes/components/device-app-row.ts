import { el } from '@views/lib/dom'
import type { CollectedProcess } from '@services/bgproc'

interface DeviceAppRowProps {
  item: CollectedProcess
  onStop: (e: MouseEvent) => void
}

export function deviceAppRow({ item, onStop }: DeviceAppRowProps): HTMLDivElement {
  return el(
    'div',
    { class: 'pick-row worktree-row' },
    el(
      'div',
      { class: 'claude-main' },
      el('span', { class: 'claude-title' }, item.proc.title),
      el('span', { class: 'claude-sub' }, item.proc.cwd)
    ),
    el('button', { class: 'worktree-action worktree-remove', onClick: onStop }, 'Stop app')
  )
}
