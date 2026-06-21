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
  const main = (
    <div class="claude-main">
      <span class="picker-name">{env}</span>
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
