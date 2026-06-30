import { el } from '@views/lib/dom'
import { state } from '@views/state/spine'
import { findById, isContainer } from '@views/tree/tree'
import { setNodeGroup } from '@views/commands/commands'

export function sectionLabel(text: string): HTMLElement {
  return el('div', { class: 'section-label' }, text)
}

// A group/workspace label that accepts a dropped container (project or company
// folder) to set its group; the "Ungrouped" header clears it.
export function groupHeader(name: string, isUngrouped = false): HTMLElement {
  const node = sectionLabel(name)
  node.classList.add('group-header')
  node.addEventListener('dragover', (e) => {
    e.preventDefault()
    node.classList.add('drag-over')
  })
  node.addEventListener('dragleave', () => node.classList.remove('drag-over'))
  node.addEventListener('drop', (e) => {
    e.preventDefault()
    node.classList.remove('drag-over')
    const dragId = e.dataTransfer?.getData('text/plain')
    if (!dragId) return
    const r = findById(state.tree, dragId)
    if (!r || !isContainer(r.node)) return // only containers carry a group
    setNodeGroup(dragId, isUngrouped ? '' : name)
  })
  return node
}
