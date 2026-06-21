import type { PullRequest } from '@services/pr/pr.types'

export function prCardBranch(pr: PullRequest): HTMLElement {
  const head = (<span class="pr-branch-ref head">{pr.headRefName}</span>) as HTMLSpanElement
  const arrow = (<span class="pr-arrow">→</span>) as HTMLSpanElement
  const base = (<span class="pr-branch-ref base">{pr.baseRefName}</span>) as HTMLSpanElement
  const branch = (
    <div class="pr-branch">
      {head}
      {arrow}
      {base}
    </div>
  ) as HTMLDivElement
  branch.title = `${pr.headRefName} → ${pr.baseRefName}`
  return branch
}
