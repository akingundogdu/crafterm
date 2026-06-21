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
  const row = (
    <div class="pick-row worktree-row" onClick={onRowClick}>
      <div class="claude-main">
        <span class="claude-title">{baseName(w.path)}</span>
        <span class="claude-sub">{[w.branch, w.path].filter(Boolean).join(' · ')}</span>
      </div>
      <button class="worktree-action" onClick={onOpenClaude}>
        Claude
      </button>
      <button class="worktree-action worktree-remove" onClick={onRemove}>
        Remove
      </button>
    </div>
  ) as HTMLDivElement
  return row
}
