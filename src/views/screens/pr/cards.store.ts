import type { PullRequest, WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'
import { UITexts } from '@texts'
import { ago } from './pr-status'
import type { BadgeSpec } from './pr.types'

// Pure status-badge derivations for the PR/run/deploy cards. The view renders
// these specs via inline status pills; no DOM here. Copied into @views (§2.7).

export function checksSpec(pr: PullRequest): BadgeSpec {
  const c = pr.checks
  const cls =
    c.state === 'success' ? 'ok' : c.state === 'failure' ? 'bad' : c.state === 'pending' ? 'wait' : 'none'
  let text = 'no checks'
  if (c.state === 'success') text = `${c.pass}/${c.total} checks`
  else if (c.state === 'failure') text = `${c.fail} failed`
  else if (c.state === 'pending') text = `${c.pending} running`
  return {
    cls,
    text,
    pulse: c.state === 'pending',
    title: `${c.pass} passed · ${c.fail} failed · ${c.pending} pending`
  }
}

export function reviewSpec(pr: PullRequest): BadgeSpec | null {
  if (!pr.reviewDecision) return null
  const map: Record<string, { cls: string; text: string }> = {
    APPROVED: { cls: 'ok', text: UITexts.Pr.review.approved },
    CHANGES_REQUESTED: { cls: 'bad', text: UITexts.Pr.review.changes },
    REVIEW_REQUIRED: { cls: 'wait', text: UITexts.Pr.review.reviewNeeded }
  }
  return map[pr.reviewDecision] ?? { cls: 'none', text: pr.reviewDecision.toLowerCase() }
}

export function runSpec(run: WorkflowRun): BadgeSpec {
  if (run.status !== 'completed') {
    return { cls: 'wait', text: run.status === 'queued' ? 'queued' : 'running', pulse: true }
  }
  const c = run.conclusion
  if (c === 'success') return { cls: 'ok', text: 'success' }
  if (['failure', 'timed_out', 'startup_failure', 'action_required'].includes(c)) {
    return { cls: 'bad', text: c.replace(/_/g, ' ') }
  }
  return { cls: 'none', text: c || 'done' }
}

export function deploySpec(d: DeploymentStatus): BadgeSpec {
  const s = d.state
  if (s === 'success') return { cls: 'ok', text: 'success' }
  if (s === 'failure' || s === 'error') return { cls: 'bad', text: s }
  if (s === 'inactive') return { cls: 'none', text: 'inactive' }
  return { cls: 'wait', text: s.replace(/_/g, ' ') || 'pending', pulse: true }
}

// The conflicts/mergeable pill, or null when mergeability is unknown.
export function mergeableSpec(pr: PullRequest): BadgeSpec | null {
  if (pr.mergeable === 'CONFLICTING') return { cls: 'bad', text: 'conflicts' }
  if (pr.mergeable === 'MERGEABLE') return { cls: 'ok', text: 'mergeable' }
  return null
}

export function isMergeDisabled(pr: PullRequest): boolean {
  return pr.mergeable === 'CONFLICTING' || pr.isDraft
}

export function commentTitle(comments: number): string {
  return `${comments} comment${comments === 1 ? '' : 's'}`
}

export function runMetaLine(run: WorkflowRun): string {
  return [run.headBranch, run.headSha ? run.headSha.slice(0, 7) : '', run.event, ago(run.createdAt)]
    .filter(Boolean)
    .join(' · ')
}

export function deployMetaLine(d: DeploymentStatus): string {
  return [d.ref, ago(d.createdAt)].filter(Boolean).join(' · ')
}
