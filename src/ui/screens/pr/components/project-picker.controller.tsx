import { settings } from '@ui/state/state'
import { UITexts } from '@texts'
import { prService } from '@services'
import { createOverlay, createSearchBox, createButton } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { bindEscapeClose, filterRepos, projectCountLabel, saveProjects } from './project-picker.state'

type RepoEntry = { name: string; path: string }

// Owns the searchable, multi-select repo picker modal: builds the overlay,
// loads the repo list, and re-renders the checkbox list on search. Methods are
// arrow methods so `this` binds when passed as event/render callbacks.
export class ProjectPickerController {
  private readonly onSaved: () => void
  private readonly selected = new Set(settings.prProjects)

  private readonly input: HTMLInputElement
  private readonly countEl: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly close: () => void

  private repos: RepoEntry[] = []

  constructor(onSaved: () => void) {
    this.onSaved = onSaved

    const { overlay, mount, close, onClose } = createOverlay()
    this.close = close
    bindEscapeClose(close, onClose)

    this.input = createSearchBox(UITexts.Pr.picker.search, () => this.render())
    this.countEl = (<div class="picker-markdown-count" />) as HTMLDivElement
    this.list = (<div class="pick-list picker-list" />) as HTMLDivElement
    this.list.textContent = UITexts.Pr.picker.loading

    const cancel = createButton({ text: UITexts.Pr.picker.cancel, onClick: close })
    const save = createButton({
      variant: 'primary',
      text: UITexts.Pr.picker.save,
      onClick: () => {
        saveProjects(this.repos.filter((r) => this.selected.has(r.path)).map((r) => r.path))
        close()
        onSaved()
      }
    })

    const modal = (
      <div class="modal picker-modal">
        {makeCloseButton(close)}
        <h2>{UITexts.Pr.picker.title}</h2>
        {this.input}
        {this.countEl}
        {this.list}
        <div class="modal-actions">
          {cancel}
          {save}
        </div>
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)
    mount()

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
    })
  }

  // Loads the repo list, then renders the picker. Resolves once the initial
  // render is in place (matching the original factory's await semantics).
  async open(): Promise<void> {
    const res = await prService.repos(settings.codeRoot)
    if (!res.ok) {
      this.list.replaceChildren()
      const e = (<div class="empty-hint">{res.error || 'Could not list repositories.'}</div>) as HTMLDivElement
      this.list.appendChild(e)
      return
    }
    this.repos = res.repos
    this.render()
    this.input.focus()
  }

  private render = (): void => {
    const items = filterRepos(this.repos, this.input.value)
    this.countEl.textContent = projectCountLabel(this.selected.size, items.length)
    this.list.replaceChildren()
    if (!items.length) {
      this.list.insertAdjacentHTML('beforeend', '<div class="empty-hint">No matches</div>')
      return
    }
    for (const r of items) {
      const cb = (
        <input
          type="checkbox"
          onChange={() => {
            if (cb.checked) this.selected.add(r.path)
            else this.selected.delete(r.path)
            this.countEl.textContent = projectCountLabel(this.selected.size, items.length)
          }}
        />
      ) as HTMLInputElement
      cb.checked = this.selected.has(r.path)
      const row = (
        <label class="pick-row pr-pick-row">
          {cb}
          <span class="picker-name">{r.name}</span>
        </label>
      ) as HTMLLabelElement
      this.list.appendChild(row)
    }
  }
}
