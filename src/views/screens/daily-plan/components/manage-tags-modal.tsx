import { Component } from '@geajs/core'
import '@views/components/modal/modal.css'
import type { DailyPlanTag } from '@views/types/types'
import { createOverlay } from '@views/components/overlay/overlay'
import { promptConfirm } from '@views/components/dialog/confirm'
import store from './manage-tags-modal.store'

export interface ManageTagsModalProps {
  // Re-render the board when the modal closes (tag edits affect cards).
  rerender: () => void
  // The active tag-filter set, owned by the board; a deleted tag is dropped from it
  // so the board isn't stranded on an empty filter.
  tagFilter: Set<string>
}

// gea Manage-tags modal body: edit tag colors/names and delete tags, mounted into
// the @views overlay by showManageTagsModal. The row list is a keyed reactive
// `.map()` over the store's tag snapshots — a delete reloads the store and gea
// patches the list; color/name inputs write on change without a re-render (the
// legacy imperative controller behaved the same). Deletes cascade to every task
// carrying the tag. The close "×" is inlined (a raw makeCloseButton node would
// break under re-render). Self-contained — no @ui (§2.7).
export default class ManageTagsModal extends Component {
  private readonly onCloseFn: () => void

  // Data via the constructor into plain fields — a gea Component only populates
  // `this.props` when rendered from a parent template, not from a manual `new X()`.
  constructor(opts: { onClose: () => void }) {
    super()
    this.onCloseFn = opts.onClose
  }

  private deleteTag = async (tag: DailyPlanTag): Promise<void> => {
    const ok = await promptConfirm({
      title: 'Delete tag',
      message: `Delete "${tag.name}"? It will be removed from every task.`,
      confirmText: 'Delete'
    })
    if (!ok) return
    store.deleteTag(tag)
  }

  template() {
    return (
      <div class="modal modal-prompt daily-plan-tags-modal">
        <button
          class="modal-close"
          type="button"
          aria-label="Close"
          title="Close (Esc)"
          onClick={() => this.onCloseFn()}
        >
          ×
        </button>
        <h2>Manage tags</h2>
        <div class="daily-plan-tags-list">
          {store.tags.map((raw) => {
            // Resolve the reactive proxy into a plain snapshot before reading/passing (§5.3).
            const tag = { ...raw }
            return (
              <div key={tag.id} class="daily-plan-tag-row">
                <input
                  type="color"
                  class="daily-plan-tag-color"
                  value={tag.color}
                  onChange={(e: Event) => store.setColor(tag, (e.target as HTMLInputElement).value)}
                />
                <input
                  type="text"
                  class="daily-plan-tag-name"
                  value={tag.name}
                  onChange={(e: Event) => {
                    const inp = e.target as HTMLInputElement
                    const v = inp.value.trim()
                    if (v) store.setName(tag, v)
                    else inp.value = tag.name
                  }}
                />
                <button class="daily-plan-tag-delete" onClick={() => this.deleteTag(tag)}>
                  Delete
                </button>
              </div>
            )
          })}
          {store.tags.length === 0 && (
            <div class="daily-plan-tags-empty">No tags yet. Create one from the task form.</div>
          )}
        </div>
      </div>
    )
  }
}

// Opens the gea Manage-tags modal: a @views overlay backdrop with the gea
// ManageTagsModal body mounted inside. Signature preserved so the daily-plan board
// resolves unchanged.
export function showManageTagsModal(props: ManageTagsModalProps): void {
  const ov = createOverlay()
  ov.overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') ov.close()
  }
  ov.onClose(() => {
    document.removeEventListener('keydown', onKey, true)
    props.rerender()
  })
  document.addEventListener('keydown', onKey, true)

  store.open(props.tagFilter)
  new ManageTagsModal({ onClose: () => ov.close() }).render(ov.overlay)
  ov.mount()
}
