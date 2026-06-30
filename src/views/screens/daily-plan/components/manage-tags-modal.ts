import { dailyTaskRepo, dailyTagRepo } from '@repositories'
import { el } from '@views/lib/dom'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { promptConfirm } from '@views/components/dialog/confirm'

export interface ManageTagsModalProps {
  // Re-render the board when the modal closes (tag edits affect cards).
  rerender: () => void
  // The active tag-filter set, owned by the board; a deleted tag is dropped from it
  // so the board isn't stranded on an empty filter.
  tagFilter: Set<string>
}

// Modal to edit tag colors/names and delete tags. Deletes cascade to every task
// carrying the tag. Plain-DOM port of the legacy imperative controller (an
// imperative list modal where gea reactivity buys nothing). Self-contained (§2.7).
class ManageTagsModal {
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

    this.list = el('div', { class: 'daily-plan-tags-list' })

    const modal = el('div', { class: 'modal modal-prompt daily-plan-tags-modal' }, makeCloseButton(close), el('h2', null, 'Manage tags'), this.list)
    overlay.appendChild(modal)

    this.renderList()

    mount()
  }

  private renderList = (): void => {
    const list = this.list
    list.innerHTML = ''
    if (!dailyTagRepo.getAll().length) {
      list.appendChild(el('div', { class: 'daily-plan-tags-empty' }, 'No tags yet. Create one from the task form.'))
      return
    }
    for (const tag of dailyTagRepo.getAll()) {
      const color = el('input', {
        type: 'color',
        class: 'daily-plan-tag-color',
        onChange: () => {
          tag.color = color.value
          dailyTagRepo.upsert(tag)
        }
      })
      color.value = tag.color

      const name = el('input', {
        type: 'text',
        class: 'daily-plan-tag-name',
        onChange: () => {
          const v = name.value.trim()
          if (v) {
            tag.name = v
            dailyTagRepo.upsert(tag)
          } else {
            name.value = tag.name
          }
        }
      })
      name.value = tag.name

      const del = el(
        'button',
        {
          class: 'daily-plan-tag-delete',
          onClick: async () => {
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
          }
        },
        'Delete'
      )

      list.appendChild(el('div', { class: 'daily-plan-tag-row' }, color, name, del))
    }
  }
}

// Modal to edit tag colors/names and delete tags.
export function showManageTagsModal(props: ManageTagsModalProps): void {
  new ManageTagsModal(props).open()
}
