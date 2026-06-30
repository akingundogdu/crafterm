import { el } from '@views/lib/dom'
import type { ClaudeSession } from '../claude.types'

// One row in the Claude sessions dashboard: a status dot plus the session
// title (with optional group) and a subline of branch · cwd (or the status).
export function claudeSessionRow(s: ClaudeSession, onClick: () => void): HTMLDivElement {
  return el(
    'div',
    { class: 'pick-row claude-row', onClick },
    el('span', { class: 'status-dot ' + s.status }),
    el(
      'div',
      { class: 'claude-main' },
      el('span', { class: 'claude-title' }, s.group ? `${s.title}  ·  ${s.group}` : s.title),
      el('span', { class: 'claude-sub' }, [s.branch, s.cwd].filter(Boolean).join(' · ') || s.status)
    )
  )
}
