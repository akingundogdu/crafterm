import { el } from '@views/lib/dom'

interface GitQuickActionChipsProps {
  onFetch: (e: MouseEvent) => void
  onPull: (e: MouseEvent) => void
  onStatus: (e: MouseEvent) => void
}

export function gitQuickActionChips({
  onFetch,
  onPull,
  onStatus
}: GitQuickActionChipsProps): HTMLDivElement {
  return el(
    'div',
    { class: 'git-quick-actions' },
    el('button', { class: 'git-quick-chip', type: 'button', title: 'git fetch --all --prune', onClick: onFetch }, 'Fetch'),
    el('button', { class: 'git-quick-chip', type: 'button', title: 'git pull', onClick: onPull }, 'Pull'),
    el('button', { class: 'git-quick-chip', type: 'button', title: 'git status', onClick: onStatus }, 'Status')
  )
}
