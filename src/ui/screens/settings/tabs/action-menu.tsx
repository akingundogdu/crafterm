import { UITexts } from '@texts'
import { actionMenuRepo } from '@repositories'
import { buildActionMenuRow } from './components/action-menu-row'
import {
  builtinLabel,
  moveActionItem,
  toggleActionHidden,
  removeActionItem,
  addActionItem,
  resetActionMenu,
  editActionItem
} from './action-menu.state'

export function buildActionMenuPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', `<h3>${UITexts.Settings.actionMenu.heading}</h3>`)
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Rows shown in the sidebar ⋯ menu. Builtin rows trigger an in-app action; command rows run a shell command (split beside the active pane, or a new tab). Reorder, hide, edit, or add your own.</div>'
  )

  const list = (<div class="action-menu-admin" />) as HTMLDivElement
  panel.appendChild(list)

  const render = (): void => {
    list.replaceChildren()
    if (!actionMenuRepo.getAll().length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No items.</div>')
    }
    actionMenuRepo.getAll().forEach((item, i) => {
      const subtitle =
        item.kind === 'builtin'
          ? `builtin · ${builtinLabel(item.builtinId)}`
          : `command (${item.opensAs ?? 'tab'}) · ${item.command || '—'}`
      list.appendChild(
        buildActionMenuRow({
          item,
          isFirst: i === 0,
          isLast: i === actionMenuRepo.getAll().length - 1,
          subtitle,
          onMoveUp: () => {
            if (moveActionItem(i, -1)) render()
          },
          onMoveDown: () => {
            if (moveActionItem(i, 1)) render()
          },
          onToggleHidden: () => {
            toggleActionHidden(item)
            render()
          },
          onEdit: () => void editActionItem(item).then(render),
          onDelete: () => {
            removeActionItem(item.id)
            render()
          }
        })
      )
    })
  }

  const addCmd = (
    <button
      class="settings-inline-btn"
      onClick={() => {
        void editActionItem().then((added) => {
          if (added) {
            addActionItem(added)
            render()
          }
        })
      }}
    >
      {UITexts.Settings.actionMenu.addCommand}
    </button>
  ) as HTMLButtonElement
  const reset = (
    <button
      class="settings-inline-btn"
      onClick={() => {
        resetActionMenu()
        render()
      }}
    >
      {UITexts.Settings.actionMenu.resetToDefaults}
    </button>
  ) as HTMLButtonElement
  const actions = (
    <div class="proj-detail-actions">
      {addCmd}
      {reset}
    </div>
  ) as HTMLDivElement
  panel.appendChild(actions)

  render()
}
