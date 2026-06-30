import type { WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'

// Change-detection for the PR tab's background notifications. Each tracker holds
// the previous snapshot and emits only on the transition that matters (CI leaving
// "pending", a run/deploy reaching a terminal state). `emit` is injected so the
// logic is pure and unit-testable; the app wires it to pushNotification.
// Copied into @views (§2.7, no @ui import).

export type EmitAlert = (message: string, subtitle: string) => void

export interface CheckItem {
  key: string // "repo#number" — PR numbers can collide across projects
  number: number
  title: string
  state: string
}

const TERMINAL_DEPLOY = new Set(['success', 'failure', 'error', 'inactive'])

export interface AlertTracker {
  noteChecks: (items: CheckItem[]) => void
  noteRuns: (runs: WorkflowRun[]) => void
  noteDeploys: (deployments: DeploymentStatus[]) => void
}

export function createAlertTracker(emit: EmitAlert): AlertTracker {
  let lastChecks = new Map<string, string>()
  let lastRunStatus = new Map<number, string>()
  let lastDeployState = new Map<number, string>()

  return {
    // Alert when a PR's CI transitions out of "pending".
    noteChecks(items) {
      const next = new Map<string, string>()
      for (const it of items) {
        next.set(it.key, it.state)
        const prev = lastChecks.get(it.key)
        if (prev === 'pending' && (it.state === 'success' || it.state === 'failure')) {
          emit(`PR #${it.number} checks ${it.state === 'success' ? 'passed' : 'failed'}`, it.title)
        }
      }
      lastChecks = next
    },

    // Alert when a workflow run finishes (in_progress/queued → completed).
    noteRuns(runs) {
      const next = new Map<number, string>()
      for (const r of runs) {
        next.set(r.id, r.status)
        const prev = lastRunStatus.get(r.id)
        if (prev && prev !== 'completed' && r.status === 'completed') {
          const ok = r.conclusion === 'success'
          emit(`Run ${r.name} ${ok ? 'succeeded' : r.conclusion || 'finished'}`, r.title)
        }
      }
      lastRunStatus = next
    },

    // Alert when a deployment reaches a terminal state (ignoring "inactive").
    noteDeploys(deployments) {
      const next = new Map<number, string>()
      for (const d of deployments) {
        next.set(d.id, d.state)
        const prev = lastDeployState.get(d.id)
        if (prev && !TERMINAL_DEPLOY.has(prev) && TERMINAL_DEPLOY.has(d.state) && d.state !== 'inactive') {
          emit(`Deploy ${d.environment} ${d.state}`, d.description || d.ref)
        }
      }
      lastDeployState = next
    }
  }
}
