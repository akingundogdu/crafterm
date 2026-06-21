import { splitOrder } from '../todo-doc'
import type { Entry, RowAction } from '../improve-crafterm.types'
import { showDetail } from '../improve-crafterm.state'

// DOM builder for a single Todo / Ready / Done list row: priority badge, status
// badges, clickable text, and the edit + action buttons. Editing is delegated to
// the parent via `onEdit` so this module stays free of the working model and IPC.

export interface TodoRowOptions {
  editable?: boolean
  nextUp?: boolean
  orderNum?: number
  actions: RowAction[]
}

export function buildTodoRow(
  entry: Entry,
  opts: TodoRowOptions,
  onEdit: (entry: Entry, row: HTMLElement) => void
): HTMLElement {
  const { num, body } = splitOrder(entry.text)
  // Auto-number by list position; fall back to a text-embedded leading number.
  const badgeNum = opts.orderNum != null ? String(opts.orderNum) : num
  const text = (
    <span class="improve-item-text" title="Click to read full text">
      {opts.nextUp && (
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
  ) as HTMLSpanElement
  text.addEventListener('click', (e) => {
    e.stopPropagation()
    showDetail(entry.text)
  })

  const acts = (<div class="improve-item-actions" />) as HTMLDivElement
  if (opts.editable) {
    const eb = (
      <button class="improve-item-btn" type="button" title="Edit">
        ✎
      </button>
    ) as HTMLButtonElement
    eb.addEventListener('click', () => onEdit(entry, row))
    acts.appendChild(eb)
  }
  opts.actions.forEach((a) => {
    const b = (
      <button class={'improve-item-btn' + (a.cls ? ' ' + a.cls : '')} type="button" title={a.title}>
        {a.icon}
      </button>
    ) as HTMLButtonElement
    b.addEventListener('click', () => void a.run())
    acts.appendChild(b)
  })
  const row = (
    <div class={'improve-item' + (opts.nextUp ? ' next-up' : '')}>
      {badgeNum && (
        <span class="improve-order" title={`Priority #${badgeNum}`}>
          {badgeNum}
        </span>
      )}
      {text}
      {acts}
    </div>
  ) as HTMLDivElement
  return row
}
