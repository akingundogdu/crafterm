import { UITexts } from '@texts'
import type { ActionMenuItem } from '@ui/types/types'

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

    const up = (
      <button
        class="worktree-action"
        ref={(el: HTMLButtonElement) => {
          el.disabled = isFirst
        }}
        onClick={onMoveUp}
      >
        ↑
      </button>
    ) as HTMLButtonElement
    const down = (
      <button
        class="worktree-action"
        ref={(el: HTMLButtonElement) => {
          el.disabled = isLast
        }}
        onClick={onMoveDown}
      >
        ↓
      </button>
    ) as HTMLButtonElement

    const txt = (
      <div class="action-menu-text">
        <span class="action-menu-name">{item.title}</span>
        <span class="action-menu-sub">{subtitle}</span>
      </div>
    ) as HTMLDivElement

    const hideBtn = (
      <button class="worktree-action" onClick={onToggleHidden}>
        {item.hidden ? UITexts.Settings.actionMenu.show : UITexts.Settings.actionMenu.hide}
      </button>
    ) as HTMLButtonElement
    const edit = (
      <button class="worktree-action" onClick={onEdit}>
        {UITexts.Settings.actionMenu.edit}
      </button>
    ) as HTMLButtonElement
    const del = (
      <button class="worktree-action worktree-remove" onClick={onDelete}>
        {UITexts.Settings.actionMenu.delete}
      </button>
    ) as HTMLButtonElement

    return (
      <div class={'action-menu-row' + (item.hidden ? ' hidden' : '')}>
        {up}
        {down}
        {txt}
        {hideBtn}
        {edit}
        {del}
      </div>
    ) as HTMLDivElement
  }
}
