import { Component } from '@geajs/core'
import type { Worktree } from '@services/git/git.types'
import { baseName } from '../../shared'

export interface WorktreeRowProps {
  worktree: Worktree
  onOpenClaude: (e: MouseEvent) => void
  onRemove: (e: MouseEvent) => void
  onRowClick: () => void
}

// One worktree row: name + branch/path, plus Claude / Remove actions. Rendered as
// a JSX child of the list, so gea populates `this.props`. The open/remove commands
// and modal close stay in the parent, passed in as already-bound handlers.
// Self-contained — no @ui.
export default class WorktreeRow extends Component {
  declare props: WorktreeRowProps

  template({ worktree, onOpenClaude, onRemove, onRowClick }: this['props']) {
    const w = worktree
    return (
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
    )
  }
}
