import { state } from '@ui/state/state'
import { flattenProjects } from '@ui/catalog/catalog'
import { renderFeatures } from './feature-selector'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export function projectSel(): HTMLSelectElement {
  return el('time-project')
}

export function renderProjects(): void {
  const sel = projectSel()
  const prev = sel.value
  sel.replaceChildren()
  const projects = flattenProjects(state.tree)
  if (!projects.length) {
    sel.insertAdjacentHTML('beforeend', `<option value=""></option>`)
  }
  for (const p of projects) {
    const o = (
      <option value={p.path}>{p.name}</option>
    ) as HTMLOptionElement
    sel.appendChild(o)
  }
  if (prev) sel.value = prev
  renderFeatures()
}
