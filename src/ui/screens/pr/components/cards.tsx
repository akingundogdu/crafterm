import type { PullRequest, WorkflowRun, DeploymentStatus } from '@services/pr/pr.types'
import type { PrCardActions } from './cards.types'
import { prCardShell } from './pr-card-shell'
import { runCardShell } from './run-card-shell'
import { deployCardShell } from './deploy-card-shell'

export type { PrCardActions } from './cards.types'
export { statusTag } from './status-tag'
export { checksBadge } from './pr-card-checks'
export { reviewBadge } from './pr-card-review'
export { runBadge } from './pr-card-run-badge'
export { deployBadge } from './pr-card-deploy-badge'

// Thin orchestrator for the PR tab cards: each builder composes the per-part
// pure factories in this folder. Card action handlers are injected so this
// module stays free of commands/IPC imports and renders in isolation; the
// status colors + derivations come from the pure helpers in state.

export function buildPrCard(pr: PullRequest, a: PrCardActions): HTMLElement {
  return prCardShell(pr, a)
}

export function buildRunCard(
  run: WorkflowRun,
  a: { onOpen: () => void; onLogs: () => void }
): HTMLElement {
  return runCardShell(run, a)
}

export function buildDeployCard(d: DeploymentStatus, a: { onOpen: () => void }): HTMLElement {
  return deployCardShell(d, a)
}
