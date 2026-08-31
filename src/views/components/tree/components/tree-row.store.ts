import { INDENT } from '../tree.store'
import type { Badge } from '../tree.types'

// x offset (px) of the indent guide line for an ancestor level.
export function guideX(level: number): number {
  return 10 + level * INDENT + 7
}

// class list for a trailing badge (count pill / pin dot / status pill).
export function badgeClass(b: Badge): string {
  if (b.kind === 'pin') return 'crtree-badge crtree-pin'
  if (b.kind === 'count') return 'crtree-badge crtree-count'
  return 'crtree-badge crtree-status crtree-status-' + (b.tone || 'idle') + (b.pulse ? ' crtree-pulse' : '')
}
