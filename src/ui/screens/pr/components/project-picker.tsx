import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { persistence } from '@repositories/persistence.service'
import { prService } from '@services'
import { createOverlay, createSearchBox, createButton } from '@ui/components'
import { makeCloseButton } from '@ui/dialog/dialog'

// Searchable, multi-select repo picker for the "All projects" PR/Deployments
// view. Pre-checks the current selection; on save, persists settings.prProjects
// and runs the injected onSaved (re-render) — injected to avoid a cycle with pr.ts.
export async function showProjectPicker(onSaved: () => void): Promise<void> {
  const { overlay, mount, close, onClose } = createOverlay()

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close()
  }
  document.addEventListener('keydown', onKey, true)
  onClose(() => document.removeEventListener('keydown', onKey, true))

  const input = createSearchBox(UITexts.Pr.picker.search, () => render())
  const countEl = (<div class="md-count" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  list.textContent = UITexts.Pr.picker.loading

  const cancel = createButton({ text: UITexts.Pr.picker.cancel, onClick: close })
  const save = createButton({
    variant: 'primary',
    text: UITexts.Pr.picker.save,
    onClick: () => {
      settings.prProjects = repos.filter((r) => selected.has(r.path)).map((r) => r.path)
      persistence.save()
      close()
      onSaved()
    }
  })

  const modal = (
    <div class="modal picker-modal">
      {makeCloseButton(close)}
      <h2>{UITexts.Pr.picker.title}</h2>
      {input}
      {countEl}
      {list}
      <div class="modal-actions">
        {cancel}
        {save}
      </div>
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)
  mount()

  const selected = new Set(settings.prProjects)

  const res = await prService.repos(settings.codeRoot)
  if (!res.ok) {
    list.replaceChildren()
    const e = (<div class="empty-hint">{res.error || 'Could not list repositories.'}</div>) as HTMLDivElement
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
      const cb = (<input type="checkbox" />) as HTMLInputElement
      cb.checked = selected.has(r.path)
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(r.path)
        else selected.delete(r.path)
        countEl.textContent = countLabel(items.length)
      })
      const row = (
        <label class="pick-row pr-pick-row">
          {cb}
          <span class="picker-name">{r.name}</span>
        </label>
      ) as HTMLLabelElement
      list.appendChild(row)
    }
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  })
  render()

  input.focus()
}
