import { Component } from '@geajs/core'
import { dailyTagRepo } from '@repositories'
import type { DailyPlanTag } from '@views/types/types'

export interface TagFilterPopoverProps {
  anchor: HTMLElement
  // The active tag-filter set, owned by the board; toggled in place here.
  tagFilter: Set<string>
  rerender: () => void
}

// gea port of the multi-select tag-filter popover anchored under the "Filter tags"
// button. Data is passed via the constructor into plain fields (a gea Component only
// populates `this.props` when the framework renders it from a parent template — a
// manual `new X({...})` does NOT). Rendered into <body> (NOT moved out of its gea
// render tree, which would break gea's event wiring). Toggling a tag mutates the
// caller-owned `tagFilter` set, flips the row's active class in place, and re-renders
// the board live; the popover stays open. §2.7.
class TagFilterPopover extends Component {
  rootEl: HTMLElement | null = null
  private readonly tagFilter: Set<string>
  private readonly rerender: () => void
  private readonly onCloseFn: () => void
  private readonly tags: DailyPlanTag[]

  constructor(opts: { tagFilter: Set<string>; rerender: () => void; onClose: () => void }) {
    super()
    this.tagFilter = opts.tagFilter
    this.rerender = opts.rerender
    this.onCloseFn = opts.onClose
    this.tags = dailyTagRepo.getAll()
  }

  private clear = (): void => {
    this.tagFilter.clear()
    this.rerender()
    this.onCloseFn()
  }

  private toggle = (id: string, e: MouseEvent): void => {
    if (this.tagFilter.has(id)) this.tagFilter.delete(id)
    else this.tagFilter.add(id)
    ;(e.currentTarget as HTMLElement).classList.toggle('active', this.tagFilter.has(id))
    this.rerender()
  }

  template() {
    return (
      <div class="daily-tagfilter-pop" ref={this.rootEl}>
        <div class="daily-tagfilter-head">
          <span>Filter by tags</span>
          <button class="daily-tagfilter-clear" onClick={() => this.clear()}>
            Clear
          </button>
        </div>
        {this.tags.map((tag) => {
          const id = tag.id
          return (
            <button
              key={id}
              class={'daily-tagfilter-row' + (this.tagFilter.has(id) ? ' active' : '')}
              onClick={(e: MouseEvent) => this.toggle(id, e)}
            >
              <span class="daily-tagfilter-swatch" style={{ backgroundColor: tag.color }} />
              <span class="daily-tagfilter-name">{tag.name}</span>
              <span class="daily-tagfilter-check">✓</span>
            </button>
          )
        })}
      </div>
    )
  }
}

// Opens the multi-select tag-filter popover anchored under the "Filter tags" button.
// The header re-renders on click so the anchor node can detach — we snapshot its rect
// at entry. The gea popover is rendered into <body> then positioned under the anchor
// and CLAMPED to the viewport so it is always on-screen and interactable.
export function openTagFilterPopover(props: TagFilterPopoverProps): void {
  document.querySelector('.daily-tagfilter-pop')?.remove()
  const rect = props.anchor.getBoundingClientRect()

  const comp = new TagFilterPopover({
    tagFilter: props.tagFilter,
    rerender: props.rerender,
    onClose: () => close()
  })
  comp.render(document.body)
  const pop = document.querySelector('.daily-tagfilter-pop') as HTMLElement | null
  if (!pop) return

  const w = pop.offsetWidth || 240
  const h = pop.offsetHeight || 0
  pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8)) + 'px'
  pop.style.top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - h - 8)) + 'px'

  const onDown = (ev: MouseEvent): void => {
    if (!pop.contains(ev.target as Node) && ev.target !== props.anchor) close()
  }
  const onEsc = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      ev.stopPropagation()
      close()
    }
  }
  const close = (): void => {
    pop.remove()
    document.removeEventListener('mousedown', onDown, true)
    document.removeEventListener('keydown', onEsc, true)
  }
  setTimeout(() => {
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onEsc, true)
  }, 0)
}
