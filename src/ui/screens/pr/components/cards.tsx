import type { PullRequest, WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { createButton } from '@ui/components'
import { overallState, runState, deployState, ago } from '../pr-status'

// DOM builders for the PR tab cards and their status badges. Card action handlers
// are injected so this module stays free of commands/IPC imports and renders in
// isolation; the status colors come from the pure pr-status helpers.

const COMMENT_SVG =
  '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1.5 2.75A.75.75 0 0 1 2.25 2h11.5a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-.75.75H7.06l-2.78 2.62A.5.5 0 0 1 3.5 14.2V12H2.25a.75.75 0 0 1-.75-.75v-8.5Z"/></svg>'

// A status pill carrying a leading colored dot, for a consistent badge language.
export function statusTag(
  cls: string,
  text: string,
  opts?: { pulse?: boolean; title?: string }
): HTMLElement {
  const b = (
    <span class={'pr-tag ' + cls + (opts?.pulse ? ' pulse' : '')}>
      <span class="pr-dot" />
      {text}
    </span>
  ) as HTMLSpanElement
  if (opts?.title) b.title = opts.title
  return b
}

export function checksBadge(pr: PullRequest): HTMLElement {
  const c = pr.checks
  const cls =
    c.state === 'success' ? 'ok' : c.state === 'failure' ? 'bad' : c.state === 'pending' ? 'wait' : 'none'
  let text = 'no checks'
  if (c.state === 'success') text = `${c.pass}/${c.total} checks`
  else if (c.state === 'failure') text = `${c.fail} failed`
  else if (c.state === 'pending') text = `${c.pending} running`
  return statusTag(cls, text, {
    pulse: c.state === 'pending',
    title: `${c.pass} passed · ${c.fail} failed · ${c.pending} pending`
  })
}

export function reviewBadge(pr: PullRequest): HTMLElement | null {
  if (!pr.reviewDecision) return null
  const map: Record<string, { cls: string; text: string }> = {
    APPROVED: { cls: 'ok', text: UITexts.Pr.review.approved },
    CHANGES_REQUESTED: { cls: 'bad', text: UITexts.Pr.review.changes },
    REVIEW_REQUIRED: { cls: 'wait', text: UITexts.Pr.review.reviewNeeded }
  }
  const m = map[pr.reviewDecision] ?? { cls: 'none', text: pr.reviewDecision.toLowerCase() }
  return statusTag(m.cls, m.text)
}

export function runBadge(run: WorkflowRun): HTMLElement {
  if (run.status !== 'completed') {
    const text = run.status === 'queued' ? 'queued' : 'running'
    return statusTag('wait', text, { pulse: true })
  }
  const c = run.conclusion
  if (c === 'success') return statusTag('ok', 'success')
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(c))
    return statusTag('bad', c.replace(/_/g, ' '))
  return statusTag('none', c || 'done')
}

export function deployBadge(d: DeploymentStatus): HTMLElement {
  const s = d.state
  if (s === 'success') return statusTag('ok', 'success')
  if (s === 'failure' || s === 'error') return statusTag('bad', s)
  if (s === 'inactive') return statusTag('none', 'inactive')
  return statusTag('wait', s.replace(/_/g, ' ') || 'pending', { pulse: true })
}

export interface PrCardActions {
  isCurrent: boolean
  onReview: () => void
  onDiff: () => void
  onMerge: () => void
}

export function buildPrCard(pr: PullRequest, a: PrCardActions): HTMLElement {
  const num = (<span class="pr-num">{'#' + pr.number}</span>) as HTMLSpanElement
  const title = (<span class="pr-title">{pr.title}</span>) as HTMLSpanElement
  title.title = pr.title

  const top = (
    <div class="pr-card-top">
      {num}
      {title}
    </div>
  ) as HTMLDivElement
  if (pr.isDraft) {
    const d = (<span class="pr-tag none">draft</span>) as HTMLSpanElement
    top.appendChild(d)
  }

  const head = (<span class="pr-ref head">{pr.headRefName}</span>) as HTMLSpanElement
  const arrow = (<span class="pr-arrow">→</span>) as HTMLSpanElement
  const base = (<span class="pr-ref base">{pr.baseRefName}</span>) as HTMLSpanElement
  const branch = (
    <div class="pr-branch">
      {head}
      {arrow}
      {base}
    </div>
  ) as HTMLDivElement
  branch.title = `${pr.headRefName} → ${pr.baseRefName}`

  const tags = (<div class="pr-tags" />) as HTMLDivElement
  tags.appendChild(checksBadge(pr))
  if (pr.mergeable === 'CONFLICTING') tags.appendChild(statusTag('bad', 'conflicts'))
  else if (pr.mergeable === 'MERGEABLE') tags.appendChild(statusTag('ok', 'mergeable'))
  const rev = reviewBadge(pr)
  if (rev) tags.appendChild(rev)
  if (pr.comments > 0) {
    const cm = document.createElement('span')
    cm.className = 'pr-tag none comment'
    cm.innerHTML = COMMENT_SVG
    cm.appendChild(document.createTextNode(String(pr.comments)))
    cm.title = `${pr.comments} comment${pr.comments === 1 ? '' : 's'}`
    tags.appendChild(cm)
  }

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
  const merge = createButton({
    className: 'pr-act merge',
    text: UITexts.Pr.card.merge,
    onClick: a.onMerge
  })
  merge.disabled = pr.mergeable === 'CONFLICTING' || pr.isDraft

  const el = (
    <div class={'pr-card state-' + overallState(pr) + (a.isCurrent ? ' current' : '')}>
      {top}
      {branch}
      {tags}
      <div class="pr-actions">
        {open}
        {diff}
        {merge}
      </div>
    </div>
  ) as HTMLDivElement
  return el
}

export function buildRunCard(
  run: WorkflowRun,
  a: { onOpen: () => void; onLogs: () => void }
): HTMLElement {
  const name = (<span class="pr-title">{run.name}</span>) as HTMLSpanElement
  name.title = run.name

  const meta = (<div class="pr-branch" />) as HTMLDivElement
  const parts = [run.headBranch, run.headSha ? run.headSha.slice(0, 7) : '', run.event, ago(run.createdAt)]
  meta.textContent = parts.filter(Boolean).join(' · ')

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

  const el = (
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
  return el
}

export function buildDeployCard(d: DeploymentStatus, a: { onOpen: () => void }): HTMLElement {
  const env = (<span class="pr-title">{d.environment || 'deployment'}</span>) as HTMLSpanElement
  env.title = d.environment

  const meta = (<div class="pr-branch" />) as HTMLDivElement
  meta.textContent = [d.ref, ago(d.createdAt)].filter(Boolean).join(' · ')

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

  const el = (
    <div class={'pr-card state-' + deployState(d)}>
      <div class="pr-card-top">{env}</div>
      {meta}
      {desc}
      <div class="pr-tags">{deployBadge(d)}</div>
      {acts}
    </div>
  ) as HTMLDivElement
  return el
}
