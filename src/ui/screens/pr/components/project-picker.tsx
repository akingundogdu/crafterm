import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { prService } from '@services'
import { createOverlay, createSearchBox, createButton } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { bindEscapeClose, filterRepos, projectCountLabel, saveProjects } from './project-picker.state'

// Searchable, multi-select repo picker for the "All projects" PR/Deployments
// view. Pre-checks the current selection; on save, persists settings.prProjects
// and runs the injected onSaved (re-render) — injected to avoid a cycle with pr.ts.
export async function showProjectPicker(onSaved: () => void): Promise<void> {
  const { overlay, mount, close, onClose } = createOverlay()
  bindEscapeClose(close, onClose)

  const input = createSearchBox(UITexts.Pr.picker.search, () => render())
  const countEl = (<div class="md-count" />) as HTMLDivElement
  const list = (<div class="pick-list picker-list" />) as HTMLDivElement
  list.textContent = UITexts.Pr.picker.loading

  const cancel = createButton({ text: UITexts.Pr.picker.cancel, onClick: close })
  const save = createButton({
    variant: 'primary',
    text: UITexts.Pr.picker.save,
    onClick: () => {
      saveProjects(repos.filter((r) => selected.has(r.path)).map((r) => r.path))
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

  const render = (): void => {
    const items = filterRepos(repos, input.value)
    countEl.textContent = projectCountLabel(selected.size, items.length)
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
        countEl.textContent = projectCountLabel(selected.size, items.length)
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
