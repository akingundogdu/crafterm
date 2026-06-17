import { settings } from '../../../state'
import { persistence } from '../../../services/storage/persistence.service'
import { prService } from '../../../services/ipc'
import { createOverlay, createSearchBox, createButton } from '@crafterm/ui'
import { makeCloseButton } from '../../../dialog'

// Searchable, multi-select repo picker for the "All projects" PR/Deployments
// view. Pre-checks the current selection; on save, persists settings.prProjects
// and runs the injected onSaved (re-render) — injected to avoid a cycle with pr.ts.
export async function showProjectPicker(onSaved: () => void): Promise<void> {
  const { overlay, mount, close, onClose } = createOverlay()
  const modal = document.createElement('div')
  modal.className = 'modal picker-modal'
  overlay.appendChild(modal)

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))
  modal.appendChild(makeCloseButton(close))
  mount()

  const h = document.createElement('h2')
  h.textContent = 'Add projects'
  modal.appendChild(h)

  const input = createSearchBox('Search repositories by name', () => render())
  modal.appendChild(input)

  const countEl = document.createElement('div')
  countEl.className = 'md-count'
  modal.appendChild(countEl)

  const list = document.createElement('div')
  list.className = 'pick-list picker-list'
  modal.appendChild(list)
  list.textContent = 'Loading…'

  const selected = new Set(settings.prProjects)

  const res = await prService.repos(settings.codeRoot)
  if (!res.ok) {
    list.replaceChildren()
    const e = document.createElement('div')
    e.className = 'empty-hint'
    e.textContent = res.error || 'Could not list repositories.'
    list.appendChild(e)
    return
  }
  const repos = res.repos

  const countLabel = (items: number): string =>
    `${selected.size} selected · ${items} repo${items === 1 ? '' : 's'}`

  const render = (): void => {
    const q = input.value.trim().toLowerCase()
    const items = q ? repos.filter((r) => r.name.toLowerCase().includes(q)) : repos
    countEl.textContent = countLabel(items.length)
    list.replaceChildren()
    if (!items.length) {
      list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    for (const r of items) {
      const row = document.createElement('label')
      row.className = 'pick-row pr-pick-row'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = selected.has(r.path)
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(r.path)
        else selected.delete(r.path)
        countEl.textContent = countLabel(items.length)
      })
      const name = document.createElement('span')
      name.className = 'picker-name'
      name.textContent = r.name
      row.append(cb, name)
      list.appendChild(row)
    }
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  render()

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  const cancel = createButton({ text: 'Cancel', onClick: close })
  const save = createButton({
    variant: 'primary',
    text: 'Save',
    onClick: () => {
      settings.prProjects = repos.filter((r) => selected.has(r.path)).map((r) => r.path)
      persistence.save()
      close()
      onSaved()
    }
  })
  actions.append(cancel, save)
  modal.appendChild(actions)

  input.focus()
}
