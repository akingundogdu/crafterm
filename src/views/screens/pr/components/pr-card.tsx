import { Component } from '@geajs/core'
import type { PullRequest } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { openLink } from '@views/commands/commands'
import { overallState } from '../pr-status'
import {
  checksSpec,
  mergeableSpec,
  reviewSpec,
  isMergeDisabled,
  commentTitle
} from '../cards.store'
import store from '../pr.store'

const COMMENT_PATH =
  'M1.5 2.75A.75.75 0 0 1 2.25 2h11.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H7.06l-2.78 2.62A.5.5 0 0 1 3.5 14.2V12H2.25a.75.75 0 0 1-.75-.75v-8.5Z'

// gea port of the legacy PR card (top + branch + tags + actions inlined). The pr
// prop is a reactive proxy but is only read here, so no §5.3 raw-resolve needed.
export default class PrCard extends Component {
  declare props: { pr: PullRequest; cwd: string; isCurrent: boolean }

  template({ pr, cwd, isCurrent }: this['props']) {
    const checks = checksSpec(pr)
    const merge = mergeableSpec(pr)
    const review = reviewSpec(pr)
    const badges: { key: string; cls: string; text: string; pulse?: boolean; title?: string }[] = [
      { key: 'checks', ...checks }
    ]
    if (merge) badges.push({ key: 'mergeable', ...merge })
    if (review) badges.push({ key: 'review', ...review })

    return (
      <div class={'pr-card state-' + overallState(pr) + (isCurrent ? ' current' : '')}>
        <div class="pr-card-top">
          <span class="pr-number">{'#' + pr.number}</span>
          <span class="pr-title" title={pr.title}>
            {pr.title}
          </span>
          {pr.isDraft && <span class="pr-status-tag none">draft</span>}
        </div>
        <div class="pr-branch" title={`${pr.headRefName} → ${pr.baseRefName}`}>
          <span class="pr-branch-ref head">{pr.headRefName}</span>
          <span class="pr-arrow">→</span>
          <span class="pr-branch-ref base">{pr.baseRefName}</span>
        </div>
        <div class="pr-tags">
          {badges.map((b) => (
            <span key={b.key} class={'pr-status-tag ' + b.cls + (b.pulse ? ' pulse' : '')} title={b.title}>
              <span class="pr-status-dot" />
              {b.text}
            </span>
          ))}
          {pr.comments > 0 && (
            <span class="pr-status-tag none comment" title={commentTitle(pr.comments)}>
              <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d={COMMENT_PATH} />
              </svg>
              {String(pr.comments)}
            </span>
          )}
        </div>
        <div class="pr-actions">
          <button class="pr-act primary" title={UITexts.Pr.card.reviewTitle} onClick={() => void openLink(pr.url)}>
            {UITexts.Pr.card.review}
          </button>
          <button class="pr-act" title={UITexts.Pr.card.diffTitle} onClick={() => store.openDiff(cwd, pr.number)}>
            {UITexts.Pr.card.diff}
          </button>
          <button class="pr-act merge" disabled={isMergeDisabled(pr)} onClick={() => void store.merge(pr, cwd)}>
            {UITexts.Pr.card.merge}
          </button>
        </div>
      </div>
    )
  }
}
