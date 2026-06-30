import { stepMark } from './pr-status'
import type { RunJob } from './pr.types'

// Pure poll-cadence + status-detection helpers for the PR tab. No DOM/IPC.
// Copied into @views (§2.7, no @ui import).

// Adaptive poll cadence: faster while something is in-flight, slow when settled.
export const POLL_BUSY_MS = 20_000
export const POLL_IDLE_MS = 300_000

const ACTIVE_DEPLOY_STATES = ['pending', 'in_progress', 'queued']

// Formats `gh run view` job JSON into a step-marked text block, or null to fall
// back to the raw output (unparseable / empty).
export function formatRunJobs(raw: string): string | null {
  try {
    const data = JSON.parse(raw) as { jobs?: RunJob[] }
    const lines: string[] = []
    for (const j of data.jobs ?? []) {
      const jc = `${j.status ?? ''}${j.conclusion ? '/' + j.conclusion : ''}`
      lines.push(`${stepMark(j.status ?? '', j.conclusion ?? '')} ${j.name ?? ''}  [${jc}]`)
      for (const s of j.steps ?? [])
        lines.push(`    ${stepMark(s.status ?? '', s.conclusion ?? '')} ${s.name ?? ''}`)
    }
    return lines.length ? lines.join('\n') : null
  } catch {
    return null
  }
}

export function hasPendingChecks(prs: { checks: { state: string } }[]): boolean {
  return prs.some((p) => p.checks.state === 'pending')
}

export function hasActiveDeploy(deploys: { state: string }[]): boolean {
  return deploys.some((d) => ACTIVE_DEPLOY_STATES.includes(d.state))
}

export function hasActiveRun(runs: { status: string }[]): boolean {
  return runs.some((r) => r.status !== 'completed')
}
