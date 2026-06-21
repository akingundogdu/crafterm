import type { PullRequest } from '@services/pr/pr.types'
import { overallState } from '../pr-status'
import type { PrCardActions } from './cards.types'
import { prCardTop } from './pr-card-top'
import { prCardBranch } from './pr-card-branch'
import { prCardTags } from './pr-card-tags'
import { prCardActions } from './pr-card-actions'

export function prCardShell(pr: PullRequest, a: PrCardActions): HTMLElement {
  return (
    <div class={'pr-card state-' + overallState(pr) + (a.isCurrent ? ' current' : '')}>
      {prCardTop(pr)}
      {prCardBranch(pr)}
      {prCardTags(pr)}
      {prCardActions(pr, a)}
    </div>
  ) as HTMLDivElement
}
