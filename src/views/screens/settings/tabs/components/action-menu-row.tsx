import { Component } from '@geajs/core'
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
// controls alongside the item's title and a descriptive subtitle. Rendered as a
// keyed JSX child of the list, so gea populates `this.props`. The nested-button
// onClick handlers are safe here because this is the row's OWN template, not a
// `.map()` body (the gea plugin mis-compiles a handler on a non-root element
// inside a keyed map). The repo mutations + reload stay in the parent, passed in
// as already-bound handlers. Self-contained — no @ui.
export default class ActionMenuRow extends Component {
  declare props: ActionMenuRowProps

  template({ item, isFirst, isLast, subtitle, onMoveUp, onMoveDown, onToggleHidden, onEdit, onDelete }: this['props']) {
    return (
      <div class={'action-menu-row' + (item.hidden ? ' hidden' : '')}>
        <button class="worktree-action" disabled={isFirst} onClick={onMoveUp}>
          ↑
        </button>
        <button class="worktree-action" disabled={isLast} onClick={onMoveDown}>
          ↓
        </button>
        <div class="action-menu-text">
          <span class="action-menu-name">{item.title}</span>
          <span class="action-menu-sub">{subtitle}</span>
        </div>
        <button class="worktree-action" onClick={onToggleHidden}>
          {item.hidden ? UITexts.Settings.actionMenu.show : UITexts.Settings.actionMenu.hide}
        </button>
        <button class="worktree-action" onClick={onEdit}>
          {UITexts.Settings.actionMenu.edit}
        </button>
        <button class="worktree-action worktree-remove" onClick={onDelete}>
          {UITexts.Settings.actionMenu.delete}
        </button>
      </div>
    )
  }
}
