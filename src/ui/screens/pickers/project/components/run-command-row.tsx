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
  const main = (
    <div class="claude-main">
      <span class="picker-name">{name}</span>
      <span class="project-sub">{command}</span>
    </div>
  ) as HTMLDivElement
  const splitBtn = (
    <button class="worktree-action" title={UITexts.Pickers.project.runSplitTitle}>
      Split
    </button>
  ) as HTMLButtonElement
  splitBtn.addEventListener('click', onSplit)
  const tabBtn = (
    <button class="worktree-action" title={UITexts.Pickers.project.runTabTitle}>
      New tab
    </button>
  ) as HTMLButtonElement
  tabBtn.addEventListener('click', onTab)
  return (
    <div class="pick-row project-row">
      {main}
      {splitBtn}
      {tabBtn}
    </div>
  ) as HTMLDivElement
}
