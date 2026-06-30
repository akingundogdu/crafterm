import type { DailyPlanTag } from '@views/types/types'
import { uid } from '@views/lib/uid'
import { dailyTagRepo } from '@repositories'
import { el } from '@views/lib/dom'
import { nextTagColor, tagById } from '@views/screens/daily-plan/daily-plan.state'

// Tag multi-select picker used inside the task form. Mutates the caller-owned
// `selectedIds` array in place (selections live in the parent task form); this
// widget only owns the DOM + the tag repo reads/writes. Plain-DOM port (§5.9 /
// datepicker style) — an imperative keyboard-driven widget where gea reactivity
// buys nothing; embedded into the gea task form via a ref. Self-contained (§2.7).
class TagPicker {
  private readonly host: HTMLElement
  private readonly selectedIds: string[]

  private chipBar!: HTMLDivElement
  private input!: HTMLInputElement
  private dropdown!: HTMLDivElement
  // -1 = no keyboard highlight (Enter falls back to exact-match/create). Arrow keys
  // move it across the rendered options; reset whenever the option list rebuilds.
  private activeIndex = -1

  constructor(host: HTMLElement, selectedIds: string[]) {
    this.host = host
    this.selectedIds = selectedIds
  }

  build(): void {
    const host = this.host
    host.innerHTML = ''

    this.chipBar = el('div', { class: 'daily-plan-tag-chipbar' })
    host.appendChild(this.chipBar)

    this.input = el('input', {
      type: 'text',
      class: 'daily-plan-tag-input',
      placeholder: 'Search or create tag…',
      onFocus: () => this.renderDropdown(),
      onInput: () => this.renderDropdown(),
      onBlur: () => setTimeout(() => (this.dropdown.hidden = true), 120)
    })
    host.appendChild(this.input)

    this.dropdown = el('div', { class: 'daily-plan-tag-dropdown' })
    this.dropdown.hidden = true
    host.appendChild(this.dropdown)

    document.addEventListener('keydown', this.onNavKey, true)

    this.renderChips()
  }

  private renderChips = (): void => {
    const chipBar = this.chipBar
    chipBar.innerHTML = ''
    for (const tagId of this.selectedIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      const x = el(
        'button',
        {
          class: 'daily-plan-tag-chip-x',
          onClick: () => {
            const i = this.selectedIds.indexOf(tagId)
            if (i >= 0) this.selectedIds.splice(i, 1)
            this.renderChips()
          }
        },
        '×'
      )
      const chip = el('span', { class: 'daily-plan-tag-chip removable' }, tag.name, x)
      chip.style.backgroundColor = tag.color
      chipBar.appendChild(chip)
    }
  }

  private options = (): HTMLButtonElement[] =>
    Array.from(this.dropdown.querySelectorAll<HTMLButtonElement>('.daily-plan-tag-option'))

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
    dropdown.innerHTML = ''
    this.activeIndex = -1
    const q = input.value.trim().toLowerCase()
    const matches = dailyTagRepo
      .getAll()
      .filter((t) => !this.selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 20)
    for (const tag of matches) {
      const swatch = el('span', { class: 'daily-plan-tag-swatch' })
      swatch.style.backgroundColor = tag.color
      const row = el(
        'button',
        {
          class: 'daily-plan-tag-option',
          onMousedown: (e: MouseEvent) => {
            e.preventDefault()
            this.selectedIds.push(tag.id)
            input.value = ''
            this.renderChips()
            this.renderDropdown()
            input.focus()
          }
        },
        swatch,
        el('span', null, tag.name)
      )
      dropdown.appendChild(row)
    }
    const exact = dailyTagRepo.getAll().some((t) => t.name.toLowerCase() === q)
    if (q && !exact) {
      const create = el(
        'button',
        {
          class: 'daily-plan-tag-option create',
          onMousedown: (e: MouseEvent) => {
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
          }
        },
        `+ Create "${input.value.trim()}"`
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
    if (!input.isConnected) {
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
}

// Tag multi-select picker used inside the task form. Mutates the caller-owned
// `selectedIds` array in place; this factory only owns the DOM + the tag repo.
export function buildTagPicker(host: HTMLElement, selectedIds: string[]): void {
  new TagPicker(host, selectedIds).build()
}
