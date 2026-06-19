import { settings, uid } from '../../../state'
import { persistence } from '@services/storage/persistence.service'
import { promptForm } from '../../../dialog'
import { BUILTIN_ACTIONS } from '../../../types'
import type { ActionMenuItem } from '../../../types'
import { actionMenuRepo } from '@services/storage/repositories'

export function buildActionMenuPanel(panel: HTMLElement): void {
  panel.insertAdjacentHTML('beforeend', '<h3>Action menu</h3>')
  panel.insertAdjacentHTML(
    'beforeend',
    '<div class="field-hint">Rows shown in the sidebar ⋯ menu. Builtin rows trigger an in-app action; command rows run a shell command (split beside the active pane, or a new tab). Reorder, hide, edit, or add your own.</div>'
  )

  const list = (<div class="action-menu-admin" />) as HTMLDivElement
  panel.appendChild(list)

  const builtinLabel = (id?: string): string =>
    BUILTIN_ACTIONS.find((a) => a.id === id)?.label ?? '(unknown builtin)'

  const move = (i: number, delta: number): void => {
    const arr = actionMenuRepo.getAll()
    const j = i + delta
    if (j < 0 || j >= arr.length) return
    // Positional swap — ordering isn't expressible through the CRUD repo, so the
    // physical array is reordered in place and persisted directly.
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    persistence.save()
    render()
  }

  const render = (): void => {
    list.replaceChildren()
    if (!actionMenuRepo.getAll().length) {
      list.insertAdjacentHTML('beforeend', '<div class="field-hint">No items.</div>')
    }
    actionMenuRepo.getAll().forEach((item, i) => {
      const up = (
        <button
          class="wt-act"
          ref={(el: HTMLButtonElement) => {
            el.disabled = i === 0
          }}
          onClick={() => move(i, -1)}
        >
          ↑
        </button>
      ) as HTMLButtonElement
      const down = (
        <button
          class="wt-act"
          ref={(el: HTMLButtonElement) => {
            el.disabled = i === actionMenuRepo.getAll().length - 1
          }}
          onClick={() => move(i, 1)}
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
          class="wt-act"
          onClick={() => {
            item.hidden = !item.hidden
            actionMenuRepo.upsert(item)
            render()
          }}
        >
          {item.hidden ? 'Show' : 'Hide'}
        </button>
      ) as HTMLButtonElement
      const edit = (
        <button class="wt-act" onClick={() => void editActionItem(item).then(render)}>
          Edit
        </button>
      ) as HTMLButtonElement
      const del = (
        <button
          class="wt-act wt-remove"
          onClick={() => {
            actionMenuRepo.remove(item.id)
            render()
          }}
        >
          Delete
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
            actionMenuRepo.upsert(added)
            render()
          }
        })
      }}
    >
      + Add command
    </button>
  ) as HTMLButtonElement
  const reset = (
    <button
      class="settings-inline-btn"
      onClick={() => {
        settings.actionMenu = BUILTIN_ACTIONS.map((a) => ({
          id: uid('am'),
          title: a.label,
          kind: 'builtin' as const,
          builtinId: a.id
        }))
        persistence.save()
        render()
      }}
    >
      Reset to defaults
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

// Edit an existing action item in place (returns null), or create a new command
// item (returns it). Builtin items only allow renaming; command items get a
// command + placement.
async function editActionItem(existing?: ActionMenuItem): Promise<ActionMenuItem | null> {
  const isBuiltin = existing?.kind === 'builtin'
  const values = await promptForm({
    title: existing ? 'Edit action' : 'New command action',
    fields: isBuiltin
      ? [{ key: 'title', label: 'Title', value: existing?.title, placeholder: 'menu label' }]
      : [
          { key: 'title', label: 'Title', value: existing?.title, placeholder: 'Deploy' },
          { key: 'command', label: 'Command', value: existing?.command, placeholder: 'npm run deploy' },
          { key: 'opensAs', label: 'Opens as (split/tab)', value: existing?.opensAs ?? 'tab', placeholder: 'tab' }
        ],
    confirmText: existing ? 'Save' : 'Add'
  })
  if (!values) return null
  const title = (values.title || '').trim()
  if (!title) return null
  if (existing) {
    existing.title = title
    if (!isBuiltin) {
      existing.command = (values.command || '').trim()
      existing.opensAs = (values.opensAs || '').trim() === 'split' ? 'split' : 'tab'
    }
    persistence.save()
    return null
  }
  const command = (values.command || '').trim()
  if (!command) return null
  return {
    id: uid('am'),
    title,
    kind: 'command',
    command,
    opensAs: (values.opensAs || '').trim() === 'split' ? 'split' : 'tab'
  }
}
