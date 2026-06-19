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

  const list = document.createElement('div')
  list.className = 'action-menu-admin'
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
      const row = document.createElement('div')
      row.className = 'action-menu-row' + (item.hidden ? ' hidden' : '')

      const up = document.createElement('button')
      up.className = 'wt-act'
      up.textContent = '↑'
      up.disabled = i === 0
      up.addEventListener('click', () => move(i, -1))
      const down = document.createElement('button')
      down.className = 'wt-act'
      down.textContent = '↓'
      down.disabled = i === actionMenuRepo.getAll().length - 1
      down.addEventListener('click', () => move(i, 1))

      const txt = document.createElement('div')
      txt.className = 'action-menu-text'
      const nm = document.createElement('span')
      nm.className = 'action-menu-name'
      nm.textContent = item.title
      const sub = document.createElement('span')
      sub.className = 'action-menu-sub'
      sub.textContent =
        item.kind === 'builtin'
          ? `builtin · ${builtinLabel(item.builtinId)}`
          : `command (${item.opensAs ?? 'tab'}) · ${item.command || '—'}`
      txt.append(nm, sub)

      const hideBtn = document.createElement('button')
      hideBtn.className = 'wt-act'
      hideBtn.textContent = item.hidden ? 'Show' : 'Hide'
      hideBtn.addEventListener('click', () => {
        item.hidden = !item.hidden
        actionMenuRepo.upsert(item)
        render()
      })
      const edit = document.createElement('button')
      edit.className = 'wt-act'
      edit.textContent = 'Edit'
      edit.addEventListener('click', () => void editActionItem(item).then(render))
      const del = document.createElement('button')
      del.className = 'wt-act wt-remove'
      del.textContent = 'Delete'
      del.addEventListener('click', () => {
        actionMenuRepo.remove(item.id)
        render()
      })

      row.append(up, down, txt, hideBtn, edit, del)
      list.appendChild(row)
    })
  }

  const actions = document.createElement('div')
  actions.className = 'proj-detail-actions'
  const addCmd = document.createElement('button')
  addCmd.className = 'settings-inline-btn'
  addCmd.textContent = '+ Add command'
  addCmd.addEventListener('click', () => {
    void editActionItem().then((added) => {
      if (added) {
        actionMenuRepo.upsert(added)
        render()
      }
    })
  })
  const reset = document.createElement('button')
  reset.className = 'settings-inline-btn'
  reset.textContent = 'Reset to defaults'
  reset.addEventListener('click', () => {
    settings.actionMenu = BUILTIN_ACTIONS.map((a) => ({
      id: uid('am'),
      title: a.label,
      kind: 'builtin' as const,
      builtinId: a.id
    }))
    persistence.save()
    render()
  })
  actions.append(addCmd, reset)
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

