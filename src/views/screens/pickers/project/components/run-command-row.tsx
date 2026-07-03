import { Component } from '@geajs/core'
import { UITexts } from '@texts'

export interface RunCommandRowProps {
  name: string
  command: string
  onSplit: (e: Event) => void
  onTab: (e: Event) => void
}

// One named run-command row: command name + command, with Split / New tab action
// buttons. Both spawn at the project's path via the supplied handlers. Rendered as
// a JSX child, so gea populates `this.props`.
export default class RunCommandRow extends Component {
  declare props: RunCommandRowProps

  template({ name, command, onSplit, onTab }: this['props']) {
    return (
      <div class="pick-row project-row">
        <div class="claude-main">
          <span class="picker-name">{name}</span>
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
