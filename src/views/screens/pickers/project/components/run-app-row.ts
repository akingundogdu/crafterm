import { el } from '@views/lib/dom'
import { UITexts } from '@texts'

interface RunAppRowProps {
  env: string
  command: string
  onSplit: (e: Event) => void
  onTab: (e: Event) => void
}

// One single-app run row: environment name + its dev command, with Split /
// New tab action buttons wired to the supplied handlers.
export function runAppRow({ env, command, onSplit, onTab }: RunAppRowProps): HTMLDivElement {
  const main = el(
    'div',
    { class: 'claude-main' },
    el('span', { class: 'picker-name' }, env),
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
