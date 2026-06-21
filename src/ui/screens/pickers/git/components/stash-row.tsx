import { UITexts } from '@texts'
import type { Stash } from '../git.types'

interface StashRowProps {
  stash: Stash
  onApply: (e: MouseEvent) => void
  onDrop: (e: MouseEvent) => void
}

export function stashRow({ stash, onApply, onDrop }: StashRowProps): HTMLDivElement {
  const applyBtn = (
    <button class="settings-inline-btn" title={UITexts.Pickers.git.restoreTitle} onClick={onApply}>
      Apply
    </button>
  ) as HTMLButtonElement
  const dropBtn = (
    <button class="improve-cancel" title={UITexts.Pickers.git.deleteStashTitle} onClick={onDrop}>
      Drop
    </button>
  ) as HTMLButtonElement
  return (
    <div class="pick-row stash-row">
      <div class="claude-main">
        <span class="claude-title">{stash.description || stash.ref}</span>
        <span class="claude-sub">{stash.ref}</span>
      </div>
      <div class="stash-actions">
        {applyBtn}
        {dropBtn}
      </div>
    </div>
  ) as HTMLDivElement
}
