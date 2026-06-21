import type { DailyPlanTag } from '@ui/types/types'
import { uid } from '@ui/state/state'
import { dailyTagRepo } from '@repositories'
import { nextTagColor, tagById } from '../daily-plan.state'

// Tag multi-select picker used inside the task form. Mutates the caller-owned
// `selectedIds` array in place (selections live in the parent task form); this
// factory only owns the DOM + the tag repo reads/writes.
export function buildTagPicker(host: HTMLElement, selectedIds: string[]): void {
  host.innerHTML = ''

  const chipBar = (<div class="daily-plan-tag-chipbar" />) as HTMLDivElement
  host.appendChild(chipBar)

  const renderChips = (): void => {
    chipBar.innerHTML = ''
    for (const tagId of selectedIds) {
      const tag = tagById(tagId)
      if (!tag) continue
      const x = (<button class="daily-plan-tag-chip-x">×</button>) as HTMLButtonElement
      x.addEventListener('click', () => {
        const i = selectedIds.indexOf(tagId)
        if (i >= 0) selectedIds.splice(i, 1)
        renderChips()
      })
      const chip = (
        <span class="daily-plan-tag-chip removable" style={{ backgroundColor: tag.color }}>
          {tag.name}
          {x}
        </span>
      ) as HTMLSpanElement
      chipBar.appendChild(chip)
    }
  }

  const input = (
    <input type="text" class="daily-plan-tag-input" placeholder="Search or create tag…" />
  ) as HTMLInputElement
  host.appendChild(input)

  const dropdown = (<div class="daily-plan-tag-dropdown" />) as HTMLDivElement
  dropdown.hidden = true
  host.appendChild(dropdown)

  // -1 = no keyboard highlight (Enter falls back to exact-match/create). Arrow keys
  // move it across the rendered options; reset whenever the option list rebuilds.
  let activeIndex = -1
  const options = (): HTMLButtonElement[] =>
    Array.from(dropdown.querySelectorAll<HTMLButtonElement>('.daily-plan-tag-option'))
  const applyHighlight = (): void => {
    options().forEach((opt, i) => {
      const on = i === activeIndex
      opt.classList.toggle('active', on)
      if (on) opt.scrollIntoView({ block: 'nearest' })
    })
  }

  const renderDropdown = (): void => {
    dropdown.innerHTML = ''
    activeIndex = -1
    const q = input.value.trim().toLowerCase()
    const matches = dailyTagRepo.getAll()
      .filter((t) => !selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 20)
    for (const tag of matches) {
      const row = (
        <button class="daily-plan-tag-option">
          <span class="daily-plan-tag-swatch" style={{ backgroundColor: tag.color }} />
          <span>{tag.name}</span>
        </button>
      ) as HTMLButtonElement
      row.addEventListener('mousedown', (e) => {
        e.preventDefault()
        selectedIds.push(tag.id)
        input.value = ''
        renderChips()
        renderDropdown()
        input.focus()
      })
      dropdown.appendChild(row)
    }
    const exact = dailyTagRepo.getAll().some((t) => t.name.toLowerCase() === q)
    if (q && !exact) {
      const create = (
        <button class="daily-plan-tag-option create">{`+ Create "${input.value.trim()}"`}</button>
      ) as HTMLButtonElement
      create.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const tag: DailyPlanTag = {
          id: uid('tag'),
          name: input.value.trim(),
          color: nextTagColor()
        }
        dailyTagRepo.upsert(tag)
        selectedIds.push(tag.id)
        input.value = ''
        renderChips()
        renderDropdown()
        input.focus()
      })
      dropdown.appendChild(create)
    }
    dropdown.hidden = dropdown.childElementCount === 0
  }

  input.addEventListener('focus', () => {
    renderDropdown()
  })
  input.addEventListener('input', renderDropdown)
  input.addEventListener('blur', () => {
    setTimeout(() => (dropdown.hidden = true), 120)
  })
  // Enter: select the tag whose name exactly matches the query (if one exists),
  // otherwise create a new tag with the typed text. Partial matches don't trigger
  // a select — you get exactly the tag you typed, or a fresh one.
  const selectOrCreate = (): void => {
    const name = input.value.trim()
    if (!name) return
    let tag = dailyTagRepo.getAll().find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (!tag) {
      tag = { id: uid('tag'), name, color: nextTagColor() }
      dailyTagRepo.upsert(tag)
    }
    if (!selectedIds.includes(tag.id)) selectedIds.push(tag.id)
    input.value = ''
    renderChips()
    renderDropdown()
    input.focus()
  }

  // The task form swallows keydown at document capture (stopPropagation) to keep
  // global shortcuts from firing, which also prevents an input-level keydown from
  // ever running. Listen on document capture too (same target → not blocked by the
  // form's stopPropagation) and act only while this input is focused. Self-removes
  // once the input leaves the DOM, so it doesn't outlive the modal.
  const onNavKey = (e: KeyboardEvent): void => {
    if (!input.isConnected) {
      document.removeEventListener('keydown', onNavKey, true)
      return
    }
    if (document.activeElement !== input) return
    const opts = options()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (opts.length) {
        activeIndex = activeIndex + 1 >= opts.length ? 0 : activeIndex + 1
        applyHighlight()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (opts.length) {
        activeIndex = activeIndex <= 0 ? opts.length - 1 : activeIndex - 1
        applyHighlight()
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // A highlighted option wins; otherwise fall back to exact-match-or-create.
      if (activeIndex >= 0 && opts[activeIndex]) opts[activeIndex].dispatchEvent(new MouseEvent('mousedown'))
      else selectOrCreate()
    }
  }
  document.addEventListener('keydown', onNavKey, true)

  renderChips()
}
