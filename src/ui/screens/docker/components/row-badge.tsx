import type { RowOptions } from './row.types'

export function rowBadge(badge: RowOptions['badge']): HTMLElement | null {
  return badge ? <span class={'docker-badge ' + badge.cls}>{badge.text}</span> : null
}
