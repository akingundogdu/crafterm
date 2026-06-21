import type { PullRequest } from '@services/pr/pr.types'

export function prCardTop(pr: PullRequest): HTMLElement {
  const num = (<span class="pr-number">{'#' + pr.number}</span>) as HTMLSpanElement
  const title = (<span class="pr-title">{pr.title}</span>) as HTMLSpanElement
  title.title = pr.title

  const top = (
    <div class="pr-card-top">
      {num}
      {title}
    </div>
  ) as HTMLDivElement
  if (pr.isDraft) {
    const d = (<span class="pr-status-tag none">draft</span>) as HTMLSpanElement
    top.appendChild(d)
  }
  return top
}
