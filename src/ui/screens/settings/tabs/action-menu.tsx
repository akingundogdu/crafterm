import { UITexts } from '@texts'
import { actionMenuRepo } from '@repositories'
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
      const up = (
        <button
          class="worktree-action"
          ref={(el: HTMLButtonElement) => {
            el.disabled = i === 0
          }}
          onClick={() => {
            if (moveActionItem(i, -1)) render()
          }}
        >
          ↑
        </button>
      ) as HTMLButtonElement
      const down = (
        <button
          class="worktree-action"
          ref={(el: HTMLButtonElement) => {
            el.disabled = i === actionMenuRepo.getAll().length - 1
          }}
          onClick={() => {
            if (moveActionItem(i, 1)) render()
          }}
        >
          ↓
        </button>
      ) as HTMLButtonElement

      const txt = (
        <div class="action-menu-text">
          <span class="action-menu-name">{item.title}</span>
          <span class="action-menu-sub">
            {item.kind === 'builtin'
              ? `builtin · ${builtinLabel(item.builtinId)}`
              : `command (${item.opensAs ?? 'tab'}) · ${item.command || '—'}`}
          </span>
        </div>
      ) as HTMLDivElement

      const hideBtn = (
        <button
          class="worktree-action"
          onClick={() => {
            toggleActionHidden(item)
            render()
          }}
        >
          {item.hidden ? UITexts.Settings.actionMenu.show : UITexts.Settings.actionMenu.hide}
        </button>
      ) as HTMLButtonElement
      const edit = (
        <button class="worktree-action" onClick={() => void editActionItem(item).then(render)}>
          {UITexts.Settings.actionMenu.edit}
        </button>
      ) as HTMLButtonElement
      const del = (
        <button
          class="worktree-action worktree-remove"
          onClick={() => {
            removeActionItem(item.id)
            render()
          }}
        >
          {UITexts.Settings.actionMenu.delete}
        </button>
      ) as HTMLButtonElement

      const row = (
        <div class={'action-menu-row' + (item.hidden ? ' hidden' : '')}>
          {up}
          {down}
          {txt}
          {hideBtn}
          {edit}
          {del}
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
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
