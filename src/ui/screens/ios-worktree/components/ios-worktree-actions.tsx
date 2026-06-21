import { UITexts } from '@texts'
import type { SidebarNode, ProjectNode, WorktreeNode } from '@ui/types/types'
import { makeRerunClick, makeMoreClick } from '../ios-worktree.state'

export function createIosWorktreeActions(node: SidebarNode, p: ProjectNode, wt: WorktreeNode): HTMLElement {
  const run = (
    <button class="ios-wt-act" onClick={wt.lastRun ? makeRerunClick(wt, p, wt.lastRun) : undefined}>
      ▶
    </button>
  ) as HTMLButtonElement
  if (!wt.lastRun) {
    // Disabled until the worktree has been run at least once (todo22).
    run.disabled = true
    run.title = 'Pick a target from the ⋯ menu first'
  } else {
    run.title = `Re-run: ${wt.lastRun.name}`
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
