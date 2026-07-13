import { Component } from '@geajs/core'
import { state } from '@views/state/spine'
import { findById, isContainer } from '@views/tree/tree'
import { setNodeGroup } from '@views/commands/commands'

// A sidebar section label. The plain variant is a static caption; the group-header
// variant accepts a dropped container (project or company folder) to set its group
// (the "Ungrouped" header clears it). One-shot render: the sidebar rebuilds section
// labels on every tree re-render, so no store subscription is needed. Data arrives
// via the constructor into plain fields, because a gea Component only populates
// `this.props` when rendered from a parent template, not from `new X()`.
class SectionLabel extends Component {
  private readonly text: string
  private readonly isGroupHeader: boolean
  private readonly isUngrouped: boolean

  constructor(opts: { text: string; isGroupHeader?: boolean; isUngrouped?: boolean }) {
    super()
    this.text = opts.text
    this.isGroupHeader = opts.isGroupHeader ?? false
    this.isUngrouped = opts.isUngrouped ?? false
  }

  template() {
    const { text, isGroupHeader, isUngrouped } = this
    if (!isGroupHeader) return <div class="section-label">{text}</div>
    return (
      <div
        class="section-label group-header"
        onDragOver={(e: DragEvent) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).classList.add('drag-over')
        }}
        onDragLeave={(e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('drag-over')}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).classList.remove('drag-over')
          const dragId = e.dataTransfer?.getData('text/plain')
          if (!dragId) return
          const r = findById(state.tree, dragId)
          if (!r || !isContainer(r.node)) return // only containers carry a group
          setNodeGroup(dragId, isUngrouped ? '' : text)
        }}
      >
        {text}
      </div>
    )
  }
}

export function sectionLabel(text: string): HTMLElement {
  const host = document.createElement('div')
  new SectionLabel({ text }).render(host)
  return host.firstElementChild as HTMLElement
}

// A group/workspace label that accepts a dropped container (project or company
// folder) to set its group; the "Ungrouped" header clears it.
export function groupHeader(name: string, isUngrouped = false): HTMLElement {
  const host = document.createElement('div')
  new SectionLabel({ text: name, isGroupHeader: true, isUngrouped }).render(host)
  return host.firstElementChild as HTMLElement
}
