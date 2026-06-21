import type { PullRequest } from '@services/pr/pr.types'
import { checksSpec } from './cards.state'
import { statusTag } from './status-tag'

export function checksBadge(pr: PullRequest): HTMLElement {
  const s = checksSpec(pr)
  return statusTag(s.cls, s.text, { pulse: s.pulse, title: s.title })
}
