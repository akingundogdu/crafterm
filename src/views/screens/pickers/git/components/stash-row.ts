import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { Stash } from '../git.types'

interface StashRowProps {
  stash: Stash
  onApply: (e: MouseEvent) => void
  onDrop: (e: MouseEvent) => void
}

export function stashRow({ stash, onApply, onDrop }: StashRowProps): HTMLDivElement {
  const applyBtn = el(
    'button',
    { class: 'settings-inline-btn', title: UITexts.Pickers.git.restoreTitle, onClick: onApply },
    'Apply'
  )
  const dropBtn = el(
    'button',
    { class: 'improve-cancel', title: UITexts.Pickers.git.deleteStashTitle, onClick: onDrop },
    'Drop'
  )
  return el(
    'div',
    { class: 'pick-row stash-row' },
    el(
      'div',
      { class: 'claude-main' },
      el('span', { class: 'claude-title' }, stash.description || stash.ref),
      el('span', { class: 'claude-sub' }, stash.ref)
    ),
    el('div', { class: 'stash-actions' }, applyBtn, dropBtn)
  )
}
