import { el } from '@views/lib/dom'

// Builds the `.settings-body` panel host: one `.settings-panel` per category,
// returning the body element + the per-category panel map, plus a `show`
// factory that toggles panel visibility and nav-active state together.
export function createSettingsBody(categories: readonly string[]): {
  body: HTMLDivElement
  panels: Record<string, HTMLElement>
} {
  const body = el('div', { class: 'settings-body' })
  const panels: Record<string, HTMLElement> = {}
  for (const c of categories) {
    const p = el('div', { class: 'settings-panel' })
    panels[c] = p
    body.appendChild(p)
  }
  return { body, panels }
}

// Toggles panel display + nav-button active state for the selected category.
export function makeShow(
  categories: readonly string[],
  panels: Record<string, HTMLElement>,
  navButtons: Record<string, HTMLButtonElement>
): (cat: string) => void {
  return (cat) => {
    for (const c of categories) {
      panels[c].style.display = c === cat ? 'block' : 'none'
      navButtons[c].classList.toggle('active', c === cat)
    }
  }
}
