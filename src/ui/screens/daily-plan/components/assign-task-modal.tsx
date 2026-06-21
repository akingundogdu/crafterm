import type { DailyPlanTask } from '@ui/types/types'
import { panes } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { dailyTaskRepo } from '@repositories'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { refreshPaneDailyTask } from '@ui/pane/pane'
import { createOverlay } from '@ui/components'
import { UITexts } from '@texts'
import { STATUS_LABEL, taskById } from '../daily-plan.state'

export interface AssignTaskModalProps {
  paneId: string
  // Open the edit form for the just-assigned task (owned by the board, so it can
  // wire the board re-render).
  openTaskForm: (task: DailyPlanTask) => void
}

// Modal to assign (or change / clear) the daily task a terminal pane works on.
// Picking a task assigns it and opens the task form so its status can be updated.
export function assignPaneToTask({ paneId, openTaskForm }: AssignTaskModalProps): void {
  const pane = panes.get(paneId)
  if (!pane) return

  const { overlay, mount, close, onClose } = createOverlay()
  overlay.classList.add('daily-plan-form-overlay')

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') close()
  }
  onClose(() => document.removeEventListener('keydown', onKey, true))
  document.addEventListener('keydown', onKey, true)

  const assign = (taskId: string | null): void => {
    pane.dailyTaskId = taskId
    persistence.save()
    refreshPaneDailyTask(paneId)
    close()
    if (taskId) {
      const t = taskById(taskId)
      if (t) openTaskForm(t)
    }
  }

  // Current assignment (with Open / Clear actions).
  const current = pane.dailyTaskId ? taskById(pane.dailyTaskId) : null
  let currentRow: HTMLDivElement | null = null
  if (current) {
    const clear = (
      <button class="daily-plan-secondary-btn" onClick={() => assign(null)}>
        Clear
      </button>
    ) as HTMLButtonElement
    currentRow = (
      <div class="daily-assign-current">
        <span>{`Current: ${current.issueKey ? current.issueKey + ' · ' : ''}${current.title}`}</span>
        {clear}
      </div>
    ) as HTMLDivElement
  }

  const search = (
    <input
      type="text"
      class="daily-assign-search"
      placeholder={UITexts.DailyPlan.searchTasks}
      onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
    />
  ) as HTMLInputElement

  const list = (<div class="daily-assign-list" />) as HTMLDivElement

  const modal = (
    <div class="modal modal-prompt daily-assign-modal">
      {makeCloseButton(close)}
      <h2>{UITexts.DailyPlan.assignTitle}</h2>
      {currentRow}
      {search}
      {list}
    </div>
  ) as HTMLDivElement
  overlay.appendChild(modal)

  // Candidate tasks: not done, most recent first, capped.
  const candidates = dailyTaskRepo.getAll()
    .filter((t) => t.status !== 'done')
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)

  const renderList = (): void => {
    list.innerHTML = ''
    const q = search.value.trim().toLowerCase()
    const items = candidates
      .filter((t) => !q || `${t.title} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50)
    if (!items.length) {
      list.appendChild((<div class="daily-assign-empty">No matching tasks</div>) as HTMLDivElement)
      return
    }
    for (const t of items) {
      const row = (
        <button class="daily-assign-row" onClick={() => assign(t.id)}>
          <span class="daily-assign-row-title">{`${t.issueKey ? t.issueKey + ' · ' : ''}${t.title}`}</span>
          <span class="daily-assign-row-meta">{`${STATUS_LABEL[t.status]} · ${t.date}`}</span>
        </button>
      ) as HTMLButtonElement
      list.appendChild(row)
    }
  }
  search.addEventListener('input', renderList)
  renderList()

  document.body.appendChild(overlay)
  search.focus()
}
