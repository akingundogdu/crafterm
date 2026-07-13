import { Component } from '@geajs/core'
import './stash-row.css'
import { UITexts } from '@texts'
import type { Stash } from '../git.types'

export interface StashRowProps {
  stash: Stash
  onApply: (e: MouseEvent) => void
  onDrop: (e: MouseEvent) => void
}

// One stash row: description + ref, plus Apply / Drop actions. Rendered as a JSX
// child of the stash list, so gea populates `this.props`. The git command runs +
// refresh stay in the parent, passed in as already-bound handlers. Self-contained.
export default class StashRow extends Component {
  declare props: StashRowProps

  template({ stash, onApply, onDrop }: this['props']) {
    return (
      <div class="pick-row stash-row">
        <div class="claude-main">
          <span class="claude-title">{stash.description || stash.ref}</span>
          <span class="claude-sub">{stash.ref}</span>
        </div>
        <div class="stash-actions">
          <button class="settings-inline-btn" title={UITexts.Pickers.git.restoreTitle} onClick={onApply}>
            Apply
          </button>
          <button class="improve-cancel" title={UITexts.Pickers.git.deleteStashTitle} onClick={onDrop}>
            Drop
          </button>
        </div>
      </div>
    )
  }
}
