import { Component } from '@geajs/core'
import type { WorkflowRun } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { openLink } from '@views/commands/commands'
import { runState } from '../pr-status'
import { runSpec, runMetaLine } from '../cards.state'
import store from '../pr.store'

// gea port of the legacy workflow-run card.
export default class RunCard extends Component {
  declare props: { run: WorkflowRun; cwd: string }

  template({ run, cwd }: this['props']) {
    const badge = runSpec(run)
    return (
      <div class={'pr-card state-' + runState(run)}>
        <div class="pr-card-top">
          <span class="pr-title" title={run.name}>
            {run.name}
          </span>
        </div>
        {run.title && (
          <div class="pr-branch" title={run.title}>
            {run.title}
          </div>
        )}
        <div class="pr-branch">{runMetaLine(run)}</div>
        <div class="pr-tags">
          <span class={'pr-status-tag ' + badge.cls + (badge.pulse ? ' pulse' : '')}>
            <span class="pr-status-dot" />
            {badge.text}
          </span>
        </div>
        <div class="pr-actions">
          <button
            class="pr-act primary"
            title={UITexts.Pr.card.runOpenTitle}
            disabled={!run.url}
            onClick={() => void openLink(run.url)}
          >
            {UITexts.Pr.card.open}
          </button>
          <button class="pr-act" title={UITexts.Pr.card.logsTitle} onClick={() => void store.showRunJobs(cwd, run)}>
            {UITexts.Pr.card.logs}
          </button>
        </div>
      </div>
    )
  }
}
