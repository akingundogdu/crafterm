import './ios-worktree.css'
import type { SidebarNode } from '@views/types/types'
import { iosOwner } from './ios-worktree.store'
import { createIosWorktreeDot } from './components/ios-worktree-dot'
import { createIosWorktreeActions } from './components/ios-worktree-actions'

export type { RunTarget } from './ios-worktree.types'
export { iosWorktreeEnvFor, startIosWorktreePoll, iosWorktreeMenuItems } from './ios-worktree.store'

// iOS add-on for the worktree tree nodes — the per-node view. The generic
// worktree manager (worktrees.ts) materializes worktrees as folder nodes; this
// layer adds a live status dot + ▶/⋯ build-run actions on each iOS worktree node.

// ---- Sidebar adapter hooks (called per node) ----

export function iosWorktreeDot(node: SidebarNode): HTMLElement | null {
  const own = iosOwner(node)
  if (!own) return null
  return createIosWorktreeDot(own.wt.worktreePath)
}

export function iosWorktreeTrailing(node: SidebarNode): HTMLElement | null {
  const own = iosOwner(node)
  if (!own) return null
  return createIosWorktreeActions(node, own.p, own.wt)
}
