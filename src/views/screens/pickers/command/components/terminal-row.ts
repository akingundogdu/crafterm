import { el } from '@views/lib/dom'
import type { OpenTerminal } from '../command.types'

interface TerminalRowProps {
  terminal: OpenTerminal
  active: boolean
  onClick: () => void
  onHover: () => void
}

export function terminalRow({ terminal, active, onClick, onHover }: TerminalRowProps): HTMLDivElement {
  const title = el(
    'span',
    { class: 'claude-title' },
    (terminal.claude ? '↺ ' : '') +
      (terminal.group ? `${terminal.title}  ·  ${terminal.group}` : terminal.title)
  )
  const sub = el(
    'span',
    { class: 'claude-sub' },
    [terminal.branch, terminal.cwd].filter(Boolean).join(' · ') || terminal.status
  )
  const row = el(
    'div',
    { class: 'pick-row claude-row' + (active ? ' active' : ''), onClick },
    el('span', { class: 'status-dot ' + terminal.status }),
    el('div', { class: 'claude-main' }, title, sub)
  )
  row.addEventListener('mouseenter', onHover)
  return row
}
