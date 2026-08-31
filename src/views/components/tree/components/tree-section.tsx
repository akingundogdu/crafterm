import { Component } from '@geajs/core'
import './tree-section.css'
import { getTreeRuntime } from '../tree.registry'

// A section header. The plain variant is a static caption; the group variant
// accepts a dropped container to set its group (the "ungrouped" header clears it).
// Reads the section from the registry by id (data never crosses a proxied prop).
export default class TreeSection extends Component {
  declare props: { treeId: string; id: string }

  template({ treeId, id }: this['props']) {
    const rt = getTreeRuntime(treeId)
    const section = rt.sectionById.get(id)
    if (!section) return <div class="crtree-section" />
    if (!section.group) return <div class="crtree-section">{section.label}</div>
    return (
      <div
        class="crtree-section crtree-section-group"
        onDragOver={(e: DragEvent) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).classList.add('crtree-drag-over')
        }}
        onDragLeave={(e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('crtree-drag-over')}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).classList.remove('crtree-drag-over')
          const dragId = e.dataTransfer?.getData('text/plain')
          if (!dragId) return
          rt.callbacks.onSetGroup(dragId, section.ungrouped ? '' : section.label ?? '')
        }}
      >
        {section.label}
      </div>
    )
  }
}
