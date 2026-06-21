import type { DeploymentStatus } from '@services/pr/pr.types'
import { deploySpec } from './cards.state'
import { statusTag } from './status-tag'

export function deployBadge(d: DeploymentStatus): HTMLElement {
  const s = deploySpec(d)
  return statusTag(s.cls, s.text, { pulse: s.pulse })
}
