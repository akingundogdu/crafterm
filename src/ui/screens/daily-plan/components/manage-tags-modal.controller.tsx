import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { makeCloseButton, promptConfirm } from '@ui/components/dialog/dialog'
import { createOverlay } from '@ui/components'
import type { ManageTagsModalProps } from './manage-tags-modal'

// Modal to edit tag colors/names and delete tags. Deletes cascade to every task
// carrying the tag.
export class ManageTagsModalController {
  private readonly rerender: () => void
  private readonly tagFilter: Set<string>
  private list!: HTMLDivElement

  constructor({ rerender, tagFilter }: ManageTagsModalProps) {
    this.rerender = rerender
    this.tagFilter = tagFilter
  }

  open(): void {
    const { overlay, mount, close, onClose } = createOverlay()
    overlay.classList.add('daily-plan-form-overlay')

    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
    }
    onClose(() => {
      document.removeEventListener('keydown', onKey, true)
      this.rerender()
    })
    document.addEventListener('keydown', onKey, true)

    this.list = (<div class="daily-plan-tags-list" />) as HTMLDivElement

    const modal = (
      <div class="modal modal-prompt daily-plan-tags-modal">
        {makeCloseButton(close)}
        <h2>Manage tags</h2>
        {this.list}
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)

    this.renderList()

    mount()
  }

  private renderList = (): void => {
    const list = this.list
    list.innerHTML = ''
    if (!dailyTagRepo.getAll().length) {
      list.appendChild(
        (
          <div class="daily-plan-tags-empty">No tags yet. Create one from the task form.</div>
        ) as HTMLDivElement
      )
      return
    }
    for (const tag of dailyTagRepo.getAll()) {
      const color = (
        <input
          type="color"
          class="daily-plan-tag-color"
          onChange={() => {
            tag.color = color.value
            dailyTagRepo.upsert(tag)
          }}
        />
      ) as HTMLInputElement
      color.value = tag.color

      const name = (
        <input
          type="text"
          class="daily-plan-tag-name"
          onChange={() => {
            const v = name.value.trim()
            if (v) {
              tag.name = v
              dailyTagRepo.upsert(tag)
            } else {
              name.value = tag.name
            }
          }}
        />
      ) as HTMLInputElement
      name.value = tag.name

      const del = (
        <button
          class="daily-plan-tag-delete"
          onClick={async () => {
            const ok = await promptConfirm({
              title: 'Delete tag',
              message: `Delete "${tag.name}"? It will be removed from every task.`,
              confirmText: 'Delete'
            })
            if (!ok) return
            dailyTaskRepo.remove(tag.id)
            for (const t of dailyTaskRepo.getAll()) {
              if (!t.tagIds.includes(tag.id)) continue
              t.tagIds = t.tagIds.filter((id) => id !== tag.id)
              dailyTaskRepo.upsert(t)
            }
            this.tagFilter.delete(tag.id) // drop from the active filter so the board isn't stranded empty
            this.renderList()
          }}
        >
          Delete
        </button>
      ) as HTMLButtonElement

      const row = (
        <div class="daily-plan-tag-row">
          {color}
          {name}
          {del}
        </div>
      ) as HTMLDivElement
      list.appendChild(row)
    }
  }
}
