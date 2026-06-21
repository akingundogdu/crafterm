import type { WorkflowRun } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { createButton } from '@ui/components'
import { runState } from '../pr-status'
import { runMetaLine } from './cards.state'
import { runBadge } from './pr-card-run-badge'

export function runCardShell(
  run: WorkflowRun,
  a: { onOpen: () => void; onLogs: () => void }
): HTMLElement {
  const name = (<span class="pr-title">{run.name}</span>) as HTMLSpanElement
  name.title = run.name

  const meta = (<div class="pr-branch" />) as HTMLDivElement
  meta.textContent = runMetaLine(run)

  const open = createButton({
    className: 'pr-act primary',
    text: UITexts.Pr.card.open,
    title: UITexts.Pr.card.runOpenTitle,
    onClick: a.onOpen
  })
  open.disabled = !run.url
  const logs = createButton({
    className: 'pr-act',
    text: UITexts.Pr.card.logs,
    title: UITexts.Pr.card.logsTitle,
    onClick: a.onLogs
  })

  let sub: HTMLDivElement | null = null
  if (run.title) {
    sub = (<div class="pr-branch">{run.title}</div>) as HTMLDivElement
    sub.title = run.title
  }

  return (
    <div class={'pr-card state-' + runState(run)}>
      <div class="pr-card-top">{name}</div>
      {sub}
      {meta}
      <div class="pr-tags">{runBadge(run)}</div>
      <div class="pr-actions">
        {open}
        {logs}
      </div>
    </div>
  ) as HTMLDivElement
}
