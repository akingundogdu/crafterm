import { Component } from '@geajs/core'
import type { DeploymentStatus } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { openLink } from '@views/commands/commands'
import { deployState } from '../pr-status'
import { deploySpec, deployMetaLine } from '../cards.state'

// gea port of the legacy deployment card.
export default class DeployCard extends Component {
  declare props: { d: DeploymentStatus }

  template({ d }: this['props']) {
    const badge = deploySpec(d)
    return (
      <div class={'pr-card state-' + deployState(d)}>
        <div class="pr-card-top">
          <span class="pr-title" title={d.environment}>
            {d.environment || 'deployment'}
          </span>
        </div>
        <div class="pr-branch">{deployMetaLine(d)}</div>
        {d.description && (
          <div class="pr-branch" title={d.description}>
            {d.description}
          </div>
        )}
        <div class="pr-tags">
          <span class={'pr-status-tag ' + badge.cls + (badge.pulse ? ' pulse' : '')}>
            <span class="pr-status-dot" />
            {badge.text}
          </span>
        </div>
        {d.url && (
          <div class="pr-actions">
            <button class="pr-act primary" title={UITexts.Pr.card.deployOpenTitle} onClick={() => void openLink(d.url)}>
              {UITexts.Pr.card.open}
            </button>
          </div>
        )}
      </div>
    )
  }
}
