import { UITexts } from '@texts'
import type { SidebarNode } from '@ui/types/types'
import { iosOwner, dotInfo, makeRerunClick, makeMoreClick } from './ios-worktree.state'

export type { RunTarget } from './ios-worktree.types'
export { iosWorktreeEnvFor, startIosWorktreePoll, iosWorktreeMenuItems } from './ios-worktree.state'

// iOS add-on for the worktree tree nodes — the per-node view. The generic
// worktree manager (worktrees.ts) materializes worktrees as folder nodes; this
// layer adds a live status dot + ▶/⋯ build-run actions on each iOS worktree node.

// ---- Sidebar adapter hooks (called per node) ----

export function iosWorktreeDot(node: SidebarNode): HTMLElement | null {
  const own = iosOwner(node)
  if (!own) return null
  const st = dotInfo(own.wt.worktreePath)
  return (<span class={`ios-wt-dot ios-wt-dot-${st.cls}`} title={st.title} />) as HTMLSpanElement
}

export function iosWorktreeTrailing(node: SidebarNode): HTMLElement | null {
  const own = iosOwner(node)
  if (!own) return null
  const { p, wt } = own

  const run = (<button class="ios-wt-act">▶</button>) as HTMLButtonElement
  if (!wt.lastRun) {
    // Disabled until the worktree has been run at least once (todo22).
    run.disabled = true
    run.title = 'Pick a target from the ⋯ menu first'
  } else {
    run.title = `Re-run: ${wt.lastRun.name}`
    run.addEventListener('click', makeRerunClick(wt, p, wt.lastRun))
  }

  const more = (
    <button class="ios-wt-act" title={UITexts.IosWorktree.iosActions} onClick={makeMoreClick(node)}>
      ⋯
    </button>
  ) as HTMLButtonElement

  return (
    <span class="ios-wt-actions">
      {run}
      {more}
    </span>
  ) as HTMLSpanElement
}
