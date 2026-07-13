import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { createOverlay } from '@views/components/overlay/overlay'
import { bindEscapeClose } from './project-picker.store'
import store from './project-picker.store'

// Searchable, multi-select repo picker for the "All projects" PR/Deployments view.
// Pre-checks the current selection; on save persists settings.prProjects and runs
// onSaved (re-render). State + persistence live in the store; the checkbox rows are
// rendered unconditionally with an empty-hint sibling for the loading / error /
// no-match states. The close button is inlined (byte-identical to makeCloseButton)
// so it stays a direct child of `.modal`. Self-contained — no @ui (§2.7).
class ProjectPicker extends Component {
  template() {
    return (
      <div class="modal picker-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => store.close()}
        >
          ×
        </button>
        <h2>{UITexts.Pr.picker.title}</h2>
        <input
          class="search-box"
          type="search"
          placeholder={UITexts.Pr.picker.search}
          onInput={(e: Event) => (store.query = (e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => {
            e.stopPropagation()
            if (e.key === 'Escape') store.close()
          }}
        />
        <div class="picker-markdown-count">{store.countLabel}</div>
        <div class="pick-list picker-list">
          {store.items.map((r) => (
            <label key={r.path} class="pick-row pr-pick-row">
              <input
                type="checkbox"
                checked={store.selected.has(r.path)}
                onChange={(e: Event) => store.toggle(r.path, (e.target as HTMLInputElement).checked)}
              />
              <span class="picker-name">{r.name}</span>
            </label>
          ))}
          {store.items.length === 0 ? <div class="empty-hint">{store.hint}</div> : null}
        </div>
        <div class="modal-actions">
          <button onClick={() => store.close()}>{UITexts.Pr.picker.cancel}</button>
          <button class="button-primary" onClick={() => store.save()}>
            {UITexts.Pr.picker.save}
          </button>
        </div>
      </div>
    )
  }
}

// Opens the gea repo picker: a @views overlay backdrop with the gea ProjectPicker
// body mounted inside, then loads the repo list and focuses the search field.
// Signature preserved so the pr.tsx consumer resolves unchanged.
export async function showProjectPicker(onSaved: () => void): Promise<void> {
  const ov = createOverlay()
  store.open(onSaved, () => ov.close())
  bindEscapeClose(ov.close, ov.onClose)
  new ProjectPicker().render(ov.overlay)
  ov.mount()
  await store.load()
  ;(ov.overlay.querySelector('.picker-modal input.search-box') as HTMLInputElement | null)?.focus()
}
