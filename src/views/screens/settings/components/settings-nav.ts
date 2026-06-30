import { el } from '@views/lib/dom'

// Builds the `.settings-nav` category list: one `.settings-nav-item` button per
// category wired to `show`, returning the nav element + per-category button map.
export function createSettingsNav(
  categories: readonly string[],
  show: (cat: string) => void
): {
  nav: HTMLDivElement
  navButtons: Record<string, HTMLButtonElement>
} {
  const nav = el('div', { class: 'settings-nav' })
  const navButtons: Record<string, HTMLButtonElement> = {}
  for (const c of categories) {
    const b = el('button', { class: 'settings-nav-item', onClick: () => show(c) }, c)
    nav.appendChild(b)
    navButtons[c] = b
  }
  return { nav, navButtons }
}
