import { Component } from '@geajs/core'
import type { RowAction } from '@views/screens/improve-crafterm/improve-crafterm.types'
import { splitOrder } from '@views/screens/improve-crafterm/todo-doc'
import { showDetail } from '@views/screens/improve-crafterm/improve-crafterm.state'
import store, { type EntryView } from '../improve-crafterm.store'

// gea port of a single Todo / Ready list row: priority badge, status badges,
// clickable text (opens the read-only detail modal), an inline-edit input, and
// trailing action buttons. Backlog rows are draggable to reorder priority. The
// drag insert index travels through dataTransfer (no reactive churn mid-drag);
// only the drop mutates the store. Done rows are static and rendered by the
// parent, not through this component.
export default class TodoRow extends Component {
  declare props: {
    entry: EntryView
    orderNum: number
    nextUp?: boolean
    editable?: boolean
    actions: RowAction[]
    draggable?: boolean
  }
  editInput: HTMLInputElement | null = null

  onAfterRender(): void {
    const { entry } = this.props
    if (store.isEditing(entry.heading, entry.idx) && this.editInput && document.activeElement !== this.editInput) {
      this.editInput.focus()
      this.editInput.select()
    }
  }

  template({ entry, orderNum, nextUp, editable, actions, draggable }: this['props']) {
    if (store.isEditing(entry.heading, entry.idx)) {
      return (
        <div class="improve-item">
          <input
            class="improve-edit-input"
            value={entry.text}
            ref={this.editInput}
            onKeyDown={(e: KeyboardEvent) => {
              e.stopPropagation()
              if (e.key === 'Enter') store.commitEdit(entry.heading, entry.idx, (e.target as HTMLInputElement).value)
              else if (e.key === 'Escape') store.cancelEdit()
            }}
            onBlur={(e: Event) => store.commitEdit(entry.heading, entry.idx, (e.target as HTMLInputElement).value)}
          />
        </div>
      )
    }

    const { num, body } = splitOrder(entry.text)
    const badgeNum = orderNum != null ? String(orderNum) : num
    return (
      <div
        class={'improve-item' + (nextUp ? ' next-up' : '') + (draggable ? ' draggable' : '')}
        draggable={!!draggable}
        onDragStart={(e: DragEvent) => {
          if (!draggable) return
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', String(entry.idx))
          }
          ;(e.currentTarget as HTMLElement).classList.add('dragging')
        }}
        onDragEnd={(e: DragEvent) => {
          if (!draggable) return
          ;(e.currentTarget as HTMLElement).classList.remove('dragging', 'drag-over')
        }}
        onDragOver={(e: DragEvent) => {
          if (!draggable) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).classList.add('drag-over')
        }}
        onDragLeave={(e: DragEvent) => {
          if (!draggable) return
          ;(e.currentTarget as HTMLElement).classList.remove('drag-over')
        }}
        onDrop={(e: DragEvent) => {
          if (!draggable) return
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).classList.remove('drag-over')
          const from = Number(e.dataTransfer?.getData('text/plain'))
          if (!Number.isNaN(from)) store.reorderBacklog(from, entry.idx)
        }}
      >
        {badgeNum && (
          <span class="improve-order" title={`Priority #${badgeNum}`}>
            {badgeNum}
          </span>
        )}
        <span
          class="improve-item-text"
          title="Click to read full text"
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            showDetail(entry.text)
          }}
        >
          {nextUp && (
            <span class="improve-badge next" title="Next up — AI will implement this one next">
              ▶ next
            </span>
          )}
          {entry.inProgress && (
            <span class="improve-badge ai" title="In progress — being worked on by AI">
              🤖 in progress
            </span>
          )}
          {body}
        </span>
        <div class="improve-item-actions">
          {editable && (
            <button
              class="improve-item-btn"
              type="button"
              title="Edit"
              onClick={() => store.beginEdit(entry.heading, entry.idx)}
            >
              ✎
            </button>
          )}
          {actions.map((a, i) => (
            <button
              key={i}
              class={'improve-item-btn' + (a.cls ? ' ' + a.cls : '')}
              type="button"
              title={a.title}
              onClick={() => void a.run()}
            >
              {a.icon}
            </button>
          ))}
        </div>
      </div>
    )
  }
}
