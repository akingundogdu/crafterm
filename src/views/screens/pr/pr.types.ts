import type { PullRequest, WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'

// PR tab types (copied into @views — §2.7, no @ui import).

export interface RunJob {
  name?: string
  status?: string
  conclusion?: string
  steps?: { name?: string; status?: string; conclusion?: string }[]
}

// A resolved status badge: CSS class + label, with optional pulse + tooltip.
export interface BadgeSpec {
  cls: string
  text: string
  pulse?: boolean
  title?: string
}

// Card action handlers, injected so the cards stay free of commands/IPC imports.
export interface PrCardActions {
  isCurrent: boolean
  onReview: () => void
  onDiff: () => void
  onMerge: () => void
}

// One row in the reactive PR list. The store computes a flat array of these from
// the (heterogeneous) service results; the gea view renders each via SectionRow.
export type PrSection =
  | { kind: 'repo-label'; key: string; repo: string }
  | { kind: 'section-head'; key: string; label: string; title?: string }
  | { kind: 'empty'; key: string; text: string; group?: boolean }
  | { kind: 'pr'; key: string; pr: PullRequest; cwd: string; isCurrent: boolean }
  | { kind: 'run'; key: string; run: WorkflowRun; cwd: string }
  | { kind: 'deploy'; key: string; d: DeploymentStatus }
