import type { PullRequest, WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'

// Pure status helpers for the PR tab: map each entity to the four-state rail
// color and format the small text bits. No DOM/IPC — unit-testable in isolation.

export type RailState = 'ready' | 'running' | 'blocked' | 'neutral'

const FAILED_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure', 'action_required']

// Overall PR health → drives the left status rail color.
export function overallState(pr: PullRequest): RailState {
  if (pr.isDraft) return 'neutral'
  if (
    pr.mergeable === 'CONFLICTING' ||
    pr.reviewDecision === 'CHANGES_REQUESTED' ||
    pr.checks.state === 'failure'
  )
    return 'blocked'
  if (pr.checks.state === 'pending') return 'running'
  if (pr.reviewDecision === 'APPROVED' && pr.mergeable === 'MERGEABLE') return 'ready'
  return 'neutral'
}

export function runState(run: WorkflowRun): RailState {
  if (run.status !== 'completed') return 'running'
  if (run.conclusion === 'success') return 'ready'
  if (FAILED_CONCLUSIONS.includes(run.conclusion)) return 'blocked'
  return 'neutral'
}

export function deployState(d: DeploymentStatus): RailState {
  if (d.state === 'success') return 'ready'
  if (d.state === 'failure' || d.state === 'error') return 'blocked'
  if (d.state === 'inactive') return 'neutral'
  return 'running'
}

export function stepMark(status: string, conclusion: string): string {
  if (status !== 'completed') return '●'
  return conclusion === 'success' || conclusion === 'skipped' || conclusion === 'neutral' ? '✓' : '✕'
}

// Relative "Ns/Nm/Nh/Nd ago" label. `now` is injectable for deterministic tests.
export function ago(iso: string, now: number = Date.now()): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const s = Math.max(0, (now - t) / 1000)
  if (s < 60) return `${Math.floor(s)}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
