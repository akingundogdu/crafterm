import type { WorkflowRun } from '@services/pr/pr.types'
import { runSpec } from './cards.state'
import { statusTag } from './status-tag'

export function runBadge(run: WorkflowRun): HTMLElement {
  const s = runSpec(run)
  return statusTag(s.cls, s.text, { pulse: s.pulse })
}
