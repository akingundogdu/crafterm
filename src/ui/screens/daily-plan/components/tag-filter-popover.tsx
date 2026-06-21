import { dailyTagRepo } from '@repositories'

export interface TagFilterPopoverProps {
  anchor: HTMLElement
  // The active tag-filter set, owned by the board; toggled in place here.
  tagFilter: Set<string>
  rerender: () => void
}

// Multi-select tag-filter popover anchored under the "Filter tags" button.
// Toggling a tag updates the caller-owned `tagFilter` set and re-renders the
// board live; the popover stays open (it lives on document.body, untouched by
// the header re-render).
export function openTagFilterPopover({ anchor, tagFilter, rerender }: TagFilterPopoverProps): void {
  document.querySelector('.daily-tagfilter-pop')?.remove()
  const pop = (<div class="daily-tagfilter-pop" />) as HTMLDivElement
  const r = anchor.getBoundingClientRect()
  pop.style.left = Math.min(r.left, window.innerWidth - 240) + 'px'
  pop.style.top = r.bottom + 4 + 'px'

  const closePop = (): void => {
    pop.remove()
    document.removeEventListener('mousedown', onDoc, true)
    document.removeEventListener('keydown', onEsc, true)
  }
  const onDoc = (e: MouseEvent): void => {
    if (!pop.contains(e.target as Node) && e.target !== anchor) closePop()
  }
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closePop()
    }
  }

  const head = (
    <div class="daily-tagfilter-head">
      <span>Filter by tags</span>
      <button
        class="daily-tagfilter-clear"
        onClick={() => {
          tagFilter.clear()
          rerender()
          closePop()
        }}
      >
        Clear
      </button>
    </div>
  ) as HTMLDivElement
  pop.appendChild(head)

  for (const tag of dailyTagRepo.getAll()) {
    const row = (
      <button class={'daily-tagfilter-row' + (tagFilter.has(tag.id) ? ' active' : '')}>
        <span class="daily-tagfilter-swatch" style={{ backgroundColor: tag.color }} />
        <span class="daily-tagfilter-name">{tag.name}</span>
        <span class="daily-tagfilter-check">✓</span>
      </button>
    ) as HTMLButtonElement
    row.addEventListener('click', () => {
      if (tagFilter.has(tag.id)) tagFilter.delete(tag.id)
      else tagFilter.add(tag.id)
      row.classList.toggle('active', tagFilter.has(tag.id))
      rerender()
    })
    pop.appendChild(row)
  }

  document.body.appendChild(pop)
  setTimeout(() => {
    document.addEventListener('mousedown', onDoc, true)
    document.addEventListener('keydown', onEsc, true)
  }, 0)
}
