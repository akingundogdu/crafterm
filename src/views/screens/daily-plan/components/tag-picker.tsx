import { Component } from '@geajs/core'
import type { DailyPlanTag } from '@views/types/types'
import { uid } from '@views/lib/uid'
import { dailyTagRepo } from '@repositories'
import { nextTagColor, tagById } from '@views/screens/daily-plan/daily-plan.store'

// Tag multi-select picker used inside the gea task form. Mutates the caller-owned
// `selectedIds` array in place (selections live in the parent task form); this
// widget only owns the DOM + the tag repo reads/writes. gea Component (§2.7):
// static props via a constructor field (a manual `new X()` never populates
// `this.props`); the template lays out the empty chip bar / input / dropdown, and
// the genuinely imperative work — chip + option rendering, keyboard navigation,
// focus + dropdown visibility — runs against element refs after mount. There are
// no reactive reads, so the component renders exactly once and the imperatively
// injected chips/options are never clobbered by a re-render. The root is
// display:contents so the chip bar / input / dropdown lay out as direct children
// of the host `.daily-plan-tag-picker` (which stays the positioned containing
// block for the absolute dropdown). Self-contained — no @ui (§2.7).
export default class TagPicker extends Component {
  private readonly selectedIds: string[]

  chipBar: HTMLDivElement | null = null
  input: HTMLInputElement | null = null
  dropdown: HTMLDivElement | null = null
  // -1 = no keyboard highlight (Enter falls back to exact-match/create). Arrow keys
  // move it across the rendered options; reset whenever the option list rebuilds.
  private activeIndex = -1
  private started = false

  constructor(opts: { selectedIds: string[] }) {
    super()
    this.selectedIds = opts.selectedIds
  }

  // Refs (chipBar/input/dropdown) are assigned by gea around onAfterRender, NOT
  // synchronously after render(), so the initial chip render + document listener
  // wiring must run here (§5.11). Guarded so a defensive re-run is a no-op.
  onAfterRender(): void {
    if (this.started) return
    this.started = true
    if (this.dropdown) this.dropdown.hidden = true
    document.addEventListener('keydown', this.onNavKey, true)
    this.renderChips()
  }

  private renderChips = (): void => {
    const chipBar = this.chipBar
    if (!chipBar) return
    chipBar.innerHTML = ''
    for (const tagId of this.selectedIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      const chip = (
        <span class="daily-plan-tag-chip removable" style={{ backgroundColor: tag.color }}>
          {tag.name}
          <button
            class="daily-plan-tag-chip-x"
            onClick={() => {
              const i = this.selectedIds.indexOf(tagId)
              if (i >= 0) this.selectedIds.splice(i, 1)
              this.renderChips()
            }}
          >
            ×
          </button>
        </span>
      )
      chipBar.appendChild(chip)
    }
  }

  private options = (): HTMLButtonElement[] =>
    this.dropdown
      ? Array.from(this.dropdown.querySelectorAll<HTMLButtonElement>('.daily-plan-tag-option'))
      : []

  private applyHighlight = (): void => {
    this.options().forEach((opt, i) => {
      const on = i === this.activeIndex
      opt.classList.toggle('active', on)
      if (on) opt.scrollIntoView({ block: 'nearest' })
    })
  }

  private renderDropdown = (): void => {
    const dropdown = this.dropdown
    const input = this.input
    if (!dropdown || !input) return
    dropdown.innerHTML = ''
    this.activeIndex = -1
    const q = input.value.trim().toLowerCase()
    const matches = dailyTagRepo
      .getAll()
      .filter((t) => !this.selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 20)
    for (const tag of matches) {
      const row = (
        <button
          class="daily-plan-tag-option"
          onMousedown={(e: MouseEvent) => {
            e.preventDefault()
            this.selectedIds.push(tag.id)
            input.value = ''
            this.renderChips()
            this.renderDropdown()
            input.focus()
          }}
        >
          <span class="daily-plan-tag-swatch" style={{ backgroundColor: tag.color }} />
          <span>{tag.name}</span>
        </button>
      )
      dropdown.appendChild(row)
    }
    const exact = dailyTagRepo.getAll().some((t) => t.name.toLowerCase() === q)
    if (q && !exact) {
      const create = (
        <button
          class="daily-plan-tag-option create"
          onMousedown={(e: MouseEvent) => {
            e.preventDefault()
            const tag: DailyPlanTag = {
              id: uid('tag'),
              name: input.value.trim(),
              color: nextTagColor()
            }
            dailyTagRepo.upsert(tag)
            this.selectedIds.push(tag.id)
            input.value = ''
            this.renderChips()
            this.renderDropdown()
            input.focus()
          }}
        >
          {`+ Create "${input.value.trim()}"`}
        </button>
      )
      dropdown.appendChild(create)
    }
    dropdown.hidden = dropdown.childElementCount === 0
  }

  // Enter: select the tag whose name exactly matches the query (if one exists),
  // otherwise create a new tag with the typed text. Partial matches don't trigger
  // a select — you get exactly the tag you typed, or a fresh one.
  private selectOrCreate = (): void => {
    const input = this.input
    if (!input) return
    const name = input.value.trim()
    if (!name) return
    let tag = dailyTagRepo.getAll().find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (!tag) {
      tag = { id: uid('tag'), name, color: nextTagColor() }
      dailyTagRepo.upsert(tag)
    }
    if (!this.selectedIds.includes(tag.id)) this.selectedIds.push(tag.id)
    input.value = ''
    this.renderChips()
    this.renderDropdown()
    input.focus()
  }

  // The task form swallows keydown at document capture (stopPropagation) to keep
  // global shortcuts from firing, which also prevents an input-level keydown from
  // ever running. Listen on document capture too (same target → not blocked by the
  // form's stopPropagation) and act only while this input is focused. Self-removes
  // once the input leaves the DOM, so it doesn't outlive the modal.
  private onNavKey = (e: KeyboardEvent): void => {
    const input = this.input
    if (!input || !input.isConnected) {
      document.removeEventListener('keydown', this.onNavKey, true)
      return
    }
    if (document.activeElement !== input) return
    const opts = this.options()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (opts.length) {
        this.activeIndex = this.activeIndex + 1 >= opts.length ? 0 : this.activeIndex + 1
        this.applyHighlight()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (opts.length) {
        this.activeIndex = this.activeIndex <= 0 ? opts.length - 1 : this.activeIndex - 1
        this.applyHighlight()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // A highlighted option wins; otherwise fall back to exact-match-or-create.
      if (this.activeIndex >= 0 && opts[this.activeIndex]) opts[this.activeIndex].dispatchEvent(new MouseEvent('mousedown'))
      else this.selectOrCreate()
    }
  }

  template() {
    return (
      <div style={{ display: 'contents' }}>
        <div class="daily-plan-tag-chipbar" ref={this.chipBar} />
        <input
          type="text"
          class="daily-plan-tag-input"
          placeholder="Search or create tag…"
          ref={this.input}
          onFocus={() => this.renderDropdown()}
          onInput={() => this.renderDropdown()}
          onBlur={() =>
            setTimeout(() => {
              if (this.dropdown) this.dropdown.hidden = true
            }, 120)
          }
        />
        <div class="daily-plan-tag-dropdown" ref={this.dropdown} />
      </div>
    )
  }
}

// Tag multi-select picker used inside the task form. Mutates the caller-owned
// `selectedIds` array in place; this factory mounts the gea Component into the
// host div the form owns. Instantiated imperatively, so `selectedIds` is passed as
// a constructor field (gea does not populate `this.props` for `new X()`).
export function buildTagPicker(host: HTMLElement, selectedIds: string[]): void {
  new TagPicker({ selectedIds }).render(host)
}
