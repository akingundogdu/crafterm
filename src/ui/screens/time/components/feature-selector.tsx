import { state } from '@ui/state/state'
import { findProjectByPath } from '@ui/catalog/catalog'
import { projectSel } from './project-selector'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export function featureSel(): HTMLSelectElement {
  return el('time-feature')
}

export function renderFeatures(): void {
  const sel = featureSel()
  const projPath = projectSel().value
  const prev = sel.value
  sel.replaceChildren()
  sel.insertAdjacentHTML('beforeend', `<option value=""></option>`)
  const owner = projPath ? findProjectByPath(state.tree, projPath) : null
  for (const f of owner?.features ?? []) {
    const o = (
      <option value={f.id}>{f.name}</option>
    ) as HTMLOptionElement
    sel.appendChild(o)
  }
  if (prev) sel.value = prev
}
