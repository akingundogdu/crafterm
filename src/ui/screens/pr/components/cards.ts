import type { PullRequest, WorkflowRun, DeploymentStatus } from '@bridge/api'
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
  const b = document.createElement('span')
  b.className = 'pr-tag ' + cls + (opts?.pulse ? ' pulse' : '')
  const dot = document.createElement('span')
  dot.className = 'pr-dot'
  b.append(dot, document.createTextNode(text))
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
    APPROVED: { cls: 'ok', text: 'approved' },
    CHANGES_REQUESTED: { cls: 'bad', text: 'changes' },
    REVIEW_REQUIRED: { cls: 'wait', text: 'review needed' }
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
  const el = document.createElement('div')
  el.className = 'pr-card state-' + overallState(pr) + (a.isCurrent ? ' current' : '')

  const top = document.createElement('div')
  top.className = 'pr-card-top'
  const num = document.createElement('span')
  num.className = 'pr-num'
  num.textContent = '#' + pr.number
  const title = document.createElement('span')
  title.className = 'pr-title'
  title.textContent = pr.title
  title.title = pr.title
  top.append(num, title)
  if (pr.isDraft) {
    const d = document.createElement('span')
    d.className = 'pr-tag none'
    d.textContent = 'draft'
    top.appendChild(d)
  }
  el.appendChild(top)

  const branch = document.createElement('div')
  branch.className = 'pr-branch'
  const head = document.createElement('span')
  head.className = 'pr-ref head'
  head.textContent = pr.headRefName
  const arrow = document.createElement('span')
  arrow.className = 'pr-arrow'
  arrow.textContent = '→'
  const base = document.createElement('span')
  base.className = 'pr-ref base'
  base.textContent = pr.baseRefName
  branch.append(head, arrow, base)
  branch.title = `${pr.headRefName} → ${pr.baseRefName}`
  el.appendChild(branch)

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
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
  el.appendChild(tags)

  const acts = document.createElement('div')
  acts.className = 'pr-actions'
  const open = createButton({
    className: 'pr-act primary',
    text: 'Review',
    title: 'Open the PR in an in-app browser pane',
    onClick: a.onReview
  })
  const diff = createButton({
    className: 'pr-act',
    text: 'Diff',
    title: 'Open the diff in an in-app pane; select lines to send to a terminal',
    onClick: a.onDiff
  })
  const merge = createButton({
    className: 'pr-act merge',
    text: 'Merge',
    onClick: a.onMerge
  })
  merge.disabled = pr.mergeable === 'CONFLICTING' || pr.isDraft
  acts.append(open, diff, merge)
  el.appendChild(acts)
  return el
}

export function buildRunCard(
  run: WorkflowRun,
  a: { onOpen: () => void; onLogs: () => void }
): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pr-card state-' + runState(run)

  const top = document.createElement('div')
  top.className = 'pr-card-top'
  const name = document.createElement('span')
  name.className = 'pr-title'
  name.textContent = run.name
  name.title = run.name
  top.appendChild(name)
  el.appendChild(top)

  if (run.title) {
    const sub = document.createElement('div')
    sub.className = 'pr-branch'
    sub.textContent = run.title
    sub.title = run.title
    el.appendChild(sub)
  }

  const meta = document.createElement('div')
  meta.className = 'pr-branch'
  const parts = [run.headBranch, run.headSha ? run.headSha.slice(0, 7) : '', run.event, ago(run.createdAt)]
  meta.textContent = parts.filter(Boolean).join(' · ')
  el.appendChild(meta)

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
  tags.appendChild(runBadge(run))
  el.appendChild(tags)

  const acts = document.createElement('div')
  acts.className = 'pr-actions'
  const open = createButton({
    className: 'pr-act primary',
    text: 'Open',
    title: 'Open this run on GitHub',
    onClick: a.onOpen
  })
  open.disabled = !run.url
  const logs = createButton({
    className: 'pr-act',
    text: 'Logs',
    title: 'Show job/step breakdown',
    onClick: a.onLogs
  })
  acts.append(open, logs)
  el.appendChild(acts)
  return el
}

export function buildDeployCard(d: DeploymentStatus, a: { onOpen: () => void }): HTMLElement {
  const el = document.createElement('div')
  el.className = 'pr-card state-' + deployState(d)

  const top = document.createElement('div')
  top.className = 'pr-card-top'
  const env = document.createElement('span')
  env.className = 'pr-title'
  env.textContent = d.environment || 'deployment'
  env.title = d.environment
  top.appendChild(env)
  el.appendChild(top)

  const meta = document.createElement('div')
  meta.className = 'pr-branch'
  meta.textContent = [d.ref, ago(d.createdAt)].filter(Boolean).join(' · ')
  el.appendChild(meta)

  if (d.description) {
    const desc = document.createElement('div')
    desc.className = 'pr-branch'
    desc.textContent = d.description
    desc.title = d.description
    el.appendChild(desc)
  }

  const tags = document.createElement('div')
  tags.className = 'pr-tags'
  tags.appendChild(deployBadge(d))
  el.appendChild(tags)

  if (d.url) {
    const acts = document.createElement('div')
    acts.className = 'pr-actions'
    const open = createButton({
      className: 'pr-act primary',
      text: 'Open',
      title: 'Open the deployment / environment URL',
      onClick: a.onOpen
    })
    acts.appendChild(open)
    el.appendChild(acts)
  }
  return el
}
