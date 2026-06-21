import type { OpenTerminal } from '../command.types'

interface TerminalRowProps {
  terminal: OpenTerminal
  active: boolean
  onClick: () => void
  onHover: () => void
}

export function terminalRow({ terminal, active, onClick, onHover }: TerminalRowProps): HTMLDivElement {
  const title = (
    <span class="claude-title">
      {(terminal.claude ? '↺ ' : '') +
        (terminal.group ? `${terminal.title}  ·  ${terminal.group}` : terminal.title)}
    </span>
  ) as HTMLSpanElement
  const sub = (
    <span class="claude-sub">
      {[terminal.branch, terminal.cwd].filter(Boolean).join(' · ') || terminal.status}
    </span>
  ) as HTMLSpanElement
  const row = (
    <div class={'pick-row claude-row' + (active ? ' active' : '')} onClick={onClick}>
      <span class={'status-dot ' + terminal.status} />
      <div class="claude-main">
        {title}
        {sub}
      </div>
    </div>
  ) as HTMLDivElement
  row.addEventListener('mouseenter', onHover)
  return row
}
