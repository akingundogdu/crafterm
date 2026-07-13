import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface RunAppRowProps {
  env: string
  command: string
  onSplit: (e: Event) => void
  onTab: (e: Event) => void
}

// One single-app run row: environment name + its dev command, with Split /
// New tab action buttons wired to the supplied handlers. Rendered as a JSX child,
// so gea populates `this.props`.
export default class RunAppRow extends Component {
  declare props: RunAppRowProps

  template({ env, command, onSplit, onTab }: this['props']) {
    return (
      <div class="pick-row project-row">
        <div class="claude-main">
          <span class="picker-name">{env}</span>
          <span class="project-sub">{command}</span>
        </div>
        <button class="worktree-action" title={UITexts.Pickers.project.runSplitTitle} onClick={onSplit}>
          Split
        </button>
        <button class="worktree-action" title={UITexts.Pickers.project.runTabTitle} onClick={onTab}>
          New tab
        </button>
      </div>
    )
  }
}
