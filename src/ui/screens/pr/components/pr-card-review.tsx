import type { PullRequest } from '@services/pr/pr.types'
import { reviewSpec } from './cards.state'
import { statusTag } from './status-tag'

export function reviewBadge(pr: PullRequest): HTMLElement | null {
  const s = reviewSpec(pr)
  return s ? statusTag(s.cls, s.text) : null
}
