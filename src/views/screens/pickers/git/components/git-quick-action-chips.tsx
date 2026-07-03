import { Component } from '@geajs/core'

export interface GitQuickActionChipsProps {
  onFetch: (e: MouseEvent) => void
  onPull: (e: MouseEvent) => void
  onStatus: (e: MouseEvent) => void
}

// Quick-action chips for the branch picker: fire common git commands into the pane
// without leaving the modal. Each chip runs its command and closes, so there is no
// persistent "selected" chip — the row is a stateless segmented control. Rendered as
// a JSX child so gea populates `this.props`. Self-contained.
export default class GitQuickActionChips extends Component {
  declare props: GitQuickActionChipsProps

  template({ onFetch, onPull, onStatus }: this['props']) {
    return (
      <div class="git-quick-actions">
        <button class="git-quick-chip" type="button" title="git fetch --all --prune" onClick={onFetch}>
          Fetch
        </button>
        <button class="git-quick-chip" type="button" title="git pull" onClick={onPull}>
          Pull
        </button>
        <button class="git-quick-chip" type="button" title="git status" onClick={onStatus}>
          Status
        </button>
      </div>
    )
  }
}
