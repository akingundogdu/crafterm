import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { prService } from '@services'
import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { bindEscapeClose, filterRepos, projectCountLabel, saveProjects } from './project-picker.state'

type RepoEntry = { name: string; path: string }

// Searchable, multi-select repo picker for the "All projects" PR/Deployments
// view. Pre-checks the current selection; on save, persists settings.prProjects
// and runs onSaved (re-render). Imperative self-managing widget (search re-renders
// the checkbox list), so plain DOM via el() — gea reactivity buys nothing here.
// Mirrors the legacy ProjectPickerController; self-contained (§2.7).
class ProjectPicker {
  private readonly onSaved: () => void
  private readonly selected: Set<string>

  private readonly input: HTMLInputElement
  private readonly countEl: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly close: () => void

  private repos: RepoEntry[] = []

  constructor(onSaved: () => void) {
    this.onSaved = onSaved
    this.selected = new Set(settings.prProjects)

    const { overlay, mount, close, onClose } = createOverlay()
    this.close = close
    bindEscapeClose(close, onClose)

    this.input = el('input', {
      class: 'search-box',
      type: 'search',
      placeholder: UITexts.Pr.picker.search,
      onInput: () => this.render()
    })
    this.countEl = el('div', { class: 'picker-markdown-count' })
    this.list = el('div', { class: 'pick-list picker-list' })
    this.list.textContent = UITexts.Pr.picker.loading

    const cancel = el('button', { onClick: close }, UITexts.Pr.picker.cancel)
    const save = el(
      'button',
      {
        class: 'button-primary',
        onClick: () => {
          saveProjects(this.repos.filter((r) => this.selected.has(r.path)).map((r) => r.path))
          close()
          this.onSaved()
        }
      },
      UITexts.Pr.picker.save
    )

    const modal = el(
      'div',
      { class: 'modal picker-modal' },
      makeCloseButton(close),
      el('h2', null, UITexts.Pr.picker.title),
      this.input,
      this.countEl,
      this.list,
      el('div', { class: 'modal-actions' }, cancel, save)
    )
    overlay.appendChild(modal)
    mount()

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
    })
  }

  // Loads the repo list, then renders the picker.
  async open(): Promise<void> {
    const res = await prService.repos(settings.codeRoot)
    if (!res.ok) {
      this.list.replaceChildren()
      this.list.appendChild(el('div', { class: 'empty-hint' }, res.error || 'Could not list repositories.'))
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
      this.list.appendChild(el('div', { class: 'empty-hint' }, 'No matches'))
      return
    }
    for (const r of items) {
      const cb = el('input', { type: 'checkbox' }) as HTMLInputElement
      cb.checked = this.selected.has(r.path)
      cb.addEventListener('change', () => {
        if (cb.checked) this.selected.add(r.path)
        else this.selected.delete(r.path)
        this.countEl.textContent = projectCountLabel(this.selected.size, items.length)
      })
      const row = el('label', { class: 'pick-row pr-pick-row' }, cb, el('span', { class: 'picker-name' }, r.name))
      this.list.appendChild(row)
    }
  }
}

export async function showProjectPicker(onSaved: () => void): Promise<void> {
  await new ProjectPicker(onSaved).open()
}
