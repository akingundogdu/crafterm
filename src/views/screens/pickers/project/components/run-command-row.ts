import { el } from '@views/lib/dom'
import { UITexts } from '@texts'

interface RunCommandRowProps {
  name: string
  command: string
  onSplit: (e: Event) => void
  onTab: (e: Event) => void
}

// One named run-command row: command name + command, with Split / New tab
// action buttons. Both spawn at the project's path via the supplied handlers.
export function runCommandRow({ name, command, onSplit, onTab }: RunCommandRowProps): HTMLDivElement {
  const main = el(
    'div',
    { class: 'claude-main' },
    el('span', { class: 'picker-name' }, name),
    el('span', { class: 'project-sub' }, command)
  )
  const splitBtn = el(
    'button',
    { class: 'worktree-action', title: UITexts.Pickers.project.runSplitTitle, onClick: onSplit },
    'Split'
  )
  const tabBtn = el(
    'button',
    { class: 'worktree-action', title: UITexts.Pickers.project.runTabTitle, onClick: onTab },
    'New tab'
  )
  return el('div', { class: 'pick-row project-row' }, main, splitBtn, tabBtn)
}
