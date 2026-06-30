import { dailyTagRepo } from '@repositories'
import { el } from '@views/lib/dom'

export interface TagFilterPopoverProps {
  anchor: HTMLElement
  // The active tag-filter set, owned by the board; toggled in place here.
  tagFilter: Set<string>
  rerender: () => void
}

// Multi-select tag-filter popover anchored under the "Filter tags" button.
// Toggling a tag updates the caller-owned `tagFilter` set and re-renders the board
// live; the popover stays open (it lives on document.body, untouched by the header
// re-render). Plain-DOM port (§2.7).
class TagFilterPopover {
  private readonly anchor: HTMLElement
  private readonly tagFilter: Set<string>
  private readonly rerender: () => void
  private pop!: HTMLDivElement

  constructor({ anchor, tagFilter, rerender }: TagFilterPopoverProps) {
    this.anchor = anchor
    this.tagFilter = tagFilter
    this.rerender = rerender
  }

  open(): void {
    document.querySelector('.daily-tagfilter-pop')?.remove()
    this.pop = el('div', { class: 'daily-tagfilter-pop' })
    const r = this.anchor.getBoundingClientRect()
    this.pop.style.left = Math.min(r.left, window.innerWidth - 240) + 'px'
    this.pop.style.top = r.bottom + 4 + 'px'

    const head = el(
      'div',
      { class: 'daily-tagfilter-head' },
      el('span', null, 'Filter by tags'),
      el(
        'button',
        {
          class: 'daily-tagfilter-clear',
          onClick: () => {
            this.tagFilter.clear()
            this.rerender()
            this.closePop()
          }
        },
        'Clear'
      )
    )
    this.pop.appendChild(head)

    for (const tag of dailyTagRepo.getAll()) {
      const swatch = el('span', { class: 'daily-tagfilter-swatch' })
      swatch.style.backgroundColor = tag.color
      const row = el(
        'button',
        {
          class: 'daily-tagfilter-row' + (this.tagFilter.has(tag.id) ? ' active' : ''),
          onClick: () => {
            if (this.tagFilter.has(tag.id)) this.tagFilter.delete(tag.id)
            else this.tagFilter.add(tag.id)
            row.classList.toggle('active', this.tagFilter.has(tag.id))
            this.rerender()
          }
        },
        swatch,
        el('span', { class: 'daily-tagfilter-name' }, tag.name),
        el('span', { class: 'daily-tagfilter-check' }, '✓')
      )
      this.pop.appendChild(row)
    }

    document.body.appendChild(this.pop)
    setTimeout(() => {
      document.addEventListener('mousedown', this.onDoc, true)
      document.addEventListener('keydown', this.onEsc, true)
    }, 0)
  }

  private closePop = (): void => {
    this.pop.remove()
    document.removeEventListener('mousedown', this.onDoc, true)
    document.removeEventListener('keydown', this.onEsc, true)
  }

  private onDoc = (e: MouseEvent): void => {
    if (!this.pop.contains(e.target as Node) && e.target !== this.anchor) this.closePop()
  }

  private onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      this.closePop()
    }
  }
}

// Multi-select tag-filter popover anchored under the "Filter tags" button.
export function openTagFilterPopover(props: TagFilterPopoverProps): void {
  new TagFilterPopover(props).open()
}
