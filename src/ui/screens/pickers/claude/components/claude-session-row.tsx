import type { ClaudeSession } from '../claude.types'

// One row in the Claude sessions dashboard: a status dot plus the session
// title (with optional group) and a subline of branch · cwd (or the status).
export function claudeSessionRow(s: ClaudeSession, onClick: () => void): HTMLDivElement {
  return (
    <div class="pick-row claude-row" onClick={onClick}>
      <span class={'status-dot ' + s.status} />
      <div class="claude-main">
        <span class="claude-title">{s.group ? `${s.title}  ·  ${s.group}` : s.title}</span>
        <span class="claude-sub">{[s.branch, s.cwd].filter(Boolean).join(' · ') || s.status}</span>
      </div>
    </div>
  ) as HTMLDivElement
}
