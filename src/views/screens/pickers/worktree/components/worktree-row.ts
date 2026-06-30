import { el } from '@views/lib/dom'
import type { Worktree } from '@services/git/git.types'
import { baseName } from '../../shared'

interface WorktreeRowProps {
  worktree: Worktree
  onOpenClaude: (e: MouseEvent) => void
  onRemove: (e: MouseEvent) => void
  onRowClick: () => void
}

// One worktree row: name + branch/path, plus Claude / Remove actions. Pure
// factory — the open/remove commands and modal close stay in the parent, passed
// in as already-bound handlers.
export function worktreeRow({
  worktree,
  onOpenClaude,
  onRemove,
  onRowClick
}: WorktreeRowProps): HTMLDivElement {
  const w = worktree
  return el(
    'div',
    { class: 'pick-row worktree-row', onClick: onRowClick },
    el(
      'div',
      { class: 'claude-main' },
      el('span', { class: 'claude-title' }, baseName(w.path)),
      el('span', { class: 'claude-sub' }, [w.branch, w.path].filter(Boolean).join(' · '))
    ),
    el('button', { class: 'worktree-action', onClick: onOpenClaude }, 'Claude'),
    el('button', { class: 'worktree-action worktree-remove', onClick: onRemove }, 'Remove')
  )
}
