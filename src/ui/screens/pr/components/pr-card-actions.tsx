import type { PullRequest } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { createButton } from '@ui/components'
import { isMergeDisabled } from './cards.state'
import type { PrCardActions } from './cards.types'

export function prCardActions(pr: PullRequest, a: PrCardActions): HTMLElement {
  const open = createButton({
    className: 'pr-act primary',
    text: UITexts.Pr.card.review,
    title: UITexts.Pr.card.reviewTitle,
    onClick: a.onReview
  })
  const diff = createButton({
    className: 'pr-act',
    text: UITexts.Pr.card.diff,
    title: UITexts.Pr.card.diffTitle,
    onClick: a.onDiff
  })
  const mergeBtn = createButton({
    className: 'pr-act merge',
    text: UITexts.Pr.card.merge,
    onClick: a.onMerge
  })
  mergeBtn.disabled = isMergeDisabled(pr)

  return (
    <div class="pr-actions">
      {open}
      {diff}
      {mergeBtn}
    </div>
  ) as HTMLDivElement
}
