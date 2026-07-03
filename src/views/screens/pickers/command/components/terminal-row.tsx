import { Component } from '@geajs/core'
import type { OpenTerminal } from '../command.types'

export interface TerminalRowProps {
  terminal: OpenTerminal
  active: boolean
  onClick: () => void
  onHover: () => void
}

// One open terminal/pane row: a status dot plus title (Claude marker · folder
// trail) and a sub line (branch · cwd, falling back to status). Rendered as a
// keyed JSX child of the switcher list, so gea populates `this.props`; selection
// index and navigation stay in the controller, passed in as bound handlers.
export default class TerminalRow extends Component {
  declare props: TerminalRowProps

  template({ terminal, active, onClick, onHover }: this['props']) {
    const t = terminal
    const title =
      (t.claude ? '↺ ' : '') + (t.group ? `${t.title}  ·  ${t.group}` : t.title)
    const sub = [t.branch, t.cwd].filter(Boolean).join(' · ') || t.status
    return (
      <div class={'pick-row claude-row' + (active ? ' active' : '')} onClick={onClick} onMouseEnter={onHover}>
        <span class={'status-dot ' + t.status}></span>
        <div class="claude-main">
          <span class="claude-title">{title}</span>
          <span class="claude-sub">{sub}</span>
        </div>
      </div>
    )
  }
}
