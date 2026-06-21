import type { DeploymentStatus } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { createButton } from '@ui/components'
import { deployState } from '../pr-status'
import { deployMetaLine } from './cards.state'
import { deployBadge } from './pr-card-deploy-badge'

export function deployCardShell(d: DeploymentStatus, a: { onOpen: () => void }): HTMLElement {
  const env = (<span class="pr-title">{d.environment || 'deployment'}</span>) as HTMLSpanElement
  env.title = d.environment

  const meta = (<div class="pr-branch" />) as HTMLDivElement
  meta.textContent = deployMetaLine(d)

  let desc: HTMLDivElement | null = null
  if (d.description) {
    desc = (<div class="pr-branch">{d.description}</div>) as HTMLDivElement
    desc.title = d.description
  }

  let acts: HTMLDivElement | null = null
  if (d.url) {
    const open = createButton({
      className: 'pr-act primary',
      text: UITexts.Pr.card.open,
      title: UITexts.Pr.card.deployOpenTitle,
      onClick: a.onOpen
    })
    acts = (<div class="pr-actions">{open}</div>) as HTMLDivElement
  }

  return (
    <div class={'pr-card state-' + deployState(d)}>
      <div class="pr-card-top">{env}</div>
      {meta}
      {desc}
      <div class="pr-tags">{deployBadge(d)}</div>
      {acts}
    </div>
  ) as HTMLDivElement
}
