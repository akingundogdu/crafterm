import { el } from '@views/lib/dom'
import { UITexts } from '@texts'
import type { ActionMenuItem } from '@views/types/types'

export interface ActionMenuRowProps {
  item: ActionMenuItem
  isFirst: boolean
  isLast: boolean
  subtitle: string
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleHidden: () => void
  onEdit: () => void
  onDelete: () => void
}

// One action-menu admin row: reorder (up/down) + visibility + edit + delete
// controls alongside the item's title and a descriptive subtitle.
export class ActionMenuRowController {
  private readonly props: ActionMenuRowProps

  constructor(props: ActionMenuRowProps) {
    this.props = props
  }

  render(): HTMLDivElement {
    const { item, isFirst, isLast, subtitle, onMoveUp, onMoveDown, onToggleHidden, onEdit, onDelete } = this.props

    const up = el('button', { class: 'worktree-action', onClick: onMoveUp }, '↑')
    up.disabled = isFirst
    const down = el('button', { class: 'worktree-action', onClick: onMoveDown }, '↓')
    down.disabled = isLast

    const txt = el(
      'div',
      { class: 'action-menu-text' },
      el('span', { class: 'action-menu-name' }, item.title),
      el('span', { class: 'action-menu-sub' }, subtitle)
    )

    const hideBtn = el(
      'button',
      { class: 'worktree-action', onClick: onToggleHidden },
      item.hidden ? UITexts.Settings.actionMenu.show : UITexts.Settings.actionMenu.hide
    )
    const edit = el('button', { class: 'worktree-action', onClick: onEdit }, UITexts.Settings.actionMenu.edit)
    const del = el('button', { class: 'worktree-action worktree-remove', onClick: onDelete }, UITexts.Settings.actionMenu.delete)

    return el('div', { class: 'action-menu-row' + (item.hidden ? ' hidden' : '') }, up, down, txt, hideBtn, edit, del)
  }
}
