import { Component } from '@geajs/core'
import type { ClaudeSession } from '../claude.types'

export interface ClaudeSessionRowProps {
  session: ClaudeSession
  onRowClick: () => void
}

// One row in the Claude sessions dashboard: a status dot plus the session title
// (with optional group) and a subline of branch · cwd (or the status). Rendered as
// a keyed JSX child of the list, so gea populates `this.props`; the jump-to-pane
// handler is passed in already bound.
export default class ClaudeSessionRow extends Component {
  declare props: ClaudeSessionRowProps

  template({ session, onRowClick }: this['props']) {
    const s = session
    return (
      <div class="pick-row claude-row" onClick={onRowClick}>
        <span class={'status-dot ' + s.status}></span>
        <div class="claude-main">
          <span class="claude-title">{s.group ? `${s.title}  ·  ${s.group}` : s.title}</span>
          <span class="claude-sub">{[s.branch, s.cwd].filter(Boolean).join(' · ') || s.status}</span>
        </div>
      </div>
    )
  }
}
