import { Component } from '@geajs/core'
import type { DailyPlanStatus } from '@ui/types/types'
import store from '../daily-plan.store'
import TaskCard from './task-card'

// One board column: head + count, a per-column search box, and a keyed list of
// task cards that doubles as the drop target. Replaces the legacy
// renderBoard/wireDropTarget/applyColFilter loop — the keyed `.map()` lets gea
// reconcile only the cards that actually moved.
export default class BoardColumn extends Component {
  declare props: { status: DailyPlanStatus; label: string }

  template({ status, label }: this['props']) {
    const q = (store.colSearch[status] ?? '').trim().toLowerCase()
    const tasks = store
      .columnTasks(status)
      .filter(
        (t) =>
          !q ||
          `${t.title} ${t.description ?? ''} ${t.issueKey ?? ''} ${t.worktreeSlug ?? ''}`.toLowerCase().includes(q)
      )

    return (
      <div class="daily-plan-column" data-status={status}>
        <div class="daily-plan-column-head">
          <span class="daily-plan-column-title">{label}</span>
          <span class="daily-plan-column-count">{String(tasks.length)}</span>
        </div>
        <input
          type="text"
          class="daily-plan-col-search"
          placeholder="Search…"
          value={store.colSearch[status] ?? ''}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          onInput={(e: Event) => store.setColSearch(status, (e.target as HTMLInputElement).value)}
        />
        <div
          class="daily-plan-column-body"
          onDragOver={(e: DragEvent) => {
            e.preventDefault()
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
            ;(e.currentTarget as HTMLElement).classList.add('drop-target')
          }}
          onDragLeave={(e: DragEvent) => {
            if (e.target === e.currentTarget) (e.currentTarget as HTMLElement).classList.remove('drop-target')
          }}
          onDrop={(e: DragEvent) => {
            e.preventDefault()
            const body = e.currentTarget as HTMLElement
            body.classList.remove('drop-target')
            const id = e.dataTransfer?.getData('text/plain') ?? ''
            if (id) store.moveTask(id, status, body, e.clientY)
          }}
        >
          {/* The keyed list stays mounted unconditionally; gea fails to
              materialize list items that first appear via a reactive update from
              behind a conditional branch, so the empty hint is a sibling, not a
              ternary that swaps the list out. */}
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
          {tasks.length === 0 && <div class="daily-plan-empty-col">Drop tasks here</div>}
        </div>
      </div>
    )
  }
}
