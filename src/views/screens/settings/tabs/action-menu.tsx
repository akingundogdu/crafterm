import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import ActionMenuRow from './components/action-menu-row'
import store from './action-menu.store'
import {
  builtinLabel,
  moveActionItem,
  toggleActionHidden,
  removeActionItem,
  addActionItem,
  resetActionMenu,
  editActionItem
} from './action-menu.store'
import type { ActionMenuItem } from '@views/types/types'

// The descriptive line under each row: builtin rows name their in-app action,
// command rows show placement + the shell command. A plain (non-JSX) helper so the
// list's `.map()` callback stays an expression body.
function subtitleFor(item: ActionMenuItem): string {
  return item.kind === 'builtin'
    ? `builtin · ${builtinLabel(item.builtinId)}`
    : `command (${item.opensAs ?? 'tab'}) · ${item.command || '—'}`
}

// Reactive body of the action-menu admin: the live list of rows. Rendered as a JSX
// child of ActionMenuPanel so gea tracks its `store.items` read and re-renders it
// after every add / remove / move / hide / edit — the ssh SshList pattern. A top-
// level, imperatively mounted component (ActionMenuPanel) does not re-subscribe on
// store writes, so all reactive markup lives here. Each mutation runs the
// action-menu.state fn, then reloads the store to reassign the mirrored array.
class ActionMenuList extends Component {
  template() {
    // Read the reactive store field so this child re-renders on any mutation.
    const items = store.items
    return (
      <div class="action-menu-admin">
        {items.map((item, i) => (
          <ActionMenuRow
            key={item.id}
            item={item}
            isFirst={i === 0}
            isLast={i === items.length - 1}
            subtitle={subtitleFor(item)}
            onMoveUp={() => {
              if (moveActionItem(i, -1)) store.reload()
            }}
            onMoveDown={() => {
              if (moveActionItem(i, 1)) store.reload()
            }}
            onToggleHidden={() => {
              toggleActionHidden(item)
              store.reload()
            }}
            onEdit={() => void editActionItem(item).then(() => store.reload())}
            onDelete={() => {
              removeActionItem(item.id)
              store.reload()
            }}
          />
        ))}
        {items.length === 0 && <div class="field-hint">No items.</div>}
      </div>
    )
  }
}

// Thin shell for the Action-menu settings panel, mounted imperatively into its
// category container. The static heading + hint + footer actions live here; the
// reactive list is the ActionMenuList JSX child. Self-contained — no @ui.
class ActionMenuPanel extends Component {
  private onAdd = (): void => {
    void editActionItem().then((added) => {
      if (added) {
        addActionItem(added)
        store.reload()
      }
    })
  }

  private onReset = (): void => {
    resetActionMenu()
    store.reload()
  }

  template() {
    return (
      <div class="action-menu-panel">
        <h3>{UITexts.Settings.actionMenu.heading}</h3>
        <div class="field-hint">
          Rows shown in the sidebar ⋯ menu. Builtin rows trigger an in-app action; command rows run a shell command (split
          beside the active pane, or a new tab). Reorder, hide, edit, or add your own.
        </div>
        <ActionMenuList />
        <div class="proj-detail-actions">
          <button class="settings-inline-btn" onClick={this.onAdd}>
            {UITexts.Settings.actionMenu.addCommand}
          </button>
          <button class="settings-inline-btn" onClick={this.onReset}>
            {UITexts.Settings.actionMenu.resetToDefaults}
          </button>
        </div>
      </div>
    )
  }
}

// Builds the Action-menu settings panel into its category container. Signature +
// import path preserved so panel-loader resolves unchanged. Seeds the store from
// the repo before mounting so the list renders populated.
export function buildActionMenuPanel(panel: HTMLElement): void {
  store.reload()
  new ActionMenuPanel().render(panel)
}
