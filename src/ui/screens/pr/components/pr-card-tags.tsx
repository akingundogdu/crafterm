import type { PullRequest } from '@services/pr/pr.types'
import { mergeableSpec, commentTitle } from './cards.state'
import { statusTag } from './status-tag'
import { checksBadge } from './pr-card-checks'
import { reviewBadge } from './pr-card-review'

const COMMENT_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 2.75A.75.75 0 0 1 2.25 2h11.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H7.06l-2.78 2.62A.5.5 0 0 1 3.5 14.2V12H2.25a.75.75 0 0 1-.75-.75v-8.5Z"/></svg>'

export function prCardTags(pr: PullRequest): HTMLElement {
  const tags = (<div class="pr-tags" />) as HTMLDivElement
  tags.appendChild(checksBadge(pr))
  const merge = mergeableSpec(pr)
  if (merge) tags.appendChild(statusTag(merge.cls, merge.text))
  const rev = reviewBadge(pr)
  if (rev) tags.appendChild(rev)
  if (pr.comments > 0) {
    const cm = document.createElement('span')
    cm.className = 'pr-status-tag none comment'
    cm.innerHTML = COMMENT_SVG
    cm.appendChild(document.createTextNode(String(pr.comments)))
    cm.title = commentTitle(pr.comments)
    tags.appendChild(cm)
  }
  return tags
}
