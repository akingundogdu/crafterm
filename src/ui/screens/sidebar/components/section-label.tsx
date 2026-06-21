import { state } from '@ui/state/state'
import { findById, isContainer } from '@ui/tree/tree'
import { setNodeGroup } from '@ui/commands/commands'

export function sectionLabel(text: string): HTMLElement {
  return (<div class="section-label">{text}</div>) as HTMLDivElement
}

// A group/workspace label that accepts a dropped container (project or company
// folder) to set its group; the "Ungrouped" header clears it.
export function groupHeader(name: string, isUngrouped = false): HTMLElement {
  const el = sectionLabel(name)
  el.classList.add('group-header')
  el.addEventListener('dragover', (e) => {
    e.preventDefault()
    el.classList.add('drag-over')
  })
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'))
  el.addEventListener('drop', (e) => {
    e.preventDefault()
    el.classList.remove('drag-over')
    const dragId = e.dataTransfer?.getData('text/plain')
    if (!dragId) return
    const r = findById(state.tree, dragId)
    if (!r || !isContainer(r.node)) return // only containers carry a group
    setNodeGroup(dragId, isUngrouped ? '' : name)
  })
  return el
}
