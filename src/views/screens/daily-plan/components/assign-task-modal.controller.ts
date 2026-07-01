import type { DailyPlanTask } from '@views/types/types'
import { panes } from '@views/state/state'
import { persistence } from '@repositories/persistence.service'
import { dailyTaskRepo } from '@repositories'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { refreshPaneDailyTask } from '@views/pane/pane'
import { createOverlay } from '@views/components/overlay/overlay'
import { UITexts } from '@texts'
import { STATUS_LABEL, taskById } from '../daily-plan.state'
import { el } from '@views/lib/dom'
import type { AssignTaskModalProps } from './assign-task-modal'

// Modal to assign (or change / clear) the daily task a terminal pane works on.
// Picking a task assigns it and opens the task form so its status can be updated.
// Plain-DOM imperative modal (the @views datepicker/account-form pattern — gea
// reactivity buys nothing here). Self-contained — no @ui (§2.7).
export class AssignTaskModalController {
  private readonly paneId: string
  private readonly openTaskForm: (task: DailyPlanTask) => void

  private close!: () => void
  private search!: HTMLInputElement
  private list!: HTMLDivElement
  private candidates: DailyPlanTask[] = []

  constructor({ paneId, openTaskForm }: AssignTaskModalProps) {
    this.paneId = paneId
    this.openTaskForm = openTaskForm
  }

  open(): void {
    const pane = panes.get(this.paneId)
    if (!pane) return

    const { overlay, mount, close, onClose } = createOverlay()
    overlay.classList.add('daily-plan-form-overlay')
    this.close = close

    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') close()
    }
    onClose(() => document.removeEventListener('keydown', onKey, true))
    document.addEventListener('keydown', onKey, true)

    // Current assignment (with Open / Clear actions).
    const current = pane.dailyTaskId ? taskById(pane.dailyTaskId) : null
    let currentRow: HTMLDivElement | null = null
    if (current) {
      const clear = el('button', { class: 'daily-plan-secondary-btn', onClick: () => this.assign(null) }, 'Clear')
      currentRow = el(
        'div',
        { class: 'daily-assign-current' },
        el('span', null, `Current: ${current.issueKey ? current.issueKey + ' · ' : ''}${current.title}`),
        clear
      )
    }

    this.search = el('input', {
      type: 'text',
      class: 'daily-assign-search',
      placeholder: UITexts.DailyPlan.searchTasks,
      onKeydown: (e: KeyboardEvent) => e.stopPropagation(),
      onInput: () => this.renderList()
    })

    this.list = el('div', { class: 'daily-assign-list' })

    const modal = el(
      'div',
      { class: 'modal modal-prompt daily-assign-modal' },
      makeCloseButton(close),
      el('h2', null, UITexts.DailyPlan.assignTitle),
      currentRow,
      this.search,
      this.list
    )
    overlay.appendChild(modal)

    // Candidate tasks: not done, most recent first, capped.
    this.candidates = dailyTaskRepo
      .getAll()
      .filter((t) => t.status !== 'done')
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)

    this.renderList()

    mount()
    this.search.focus()
  }

  private assign = (taskId: string | null): void => {
    const pane = panes.get(this.paneId)
    if (!pane) return
    pane.dailyTaskId = taskId
    persistence.save()
    refreshPaneDailyTask(this.paneId)
    this.close()
    if (taskId) {
      const t = taskById(taskId)
      if (t) this.openTaskForm(t)
    }
  }

  private renderList = (): void => {
    const list = this.list
    list.innerHTML = ''
    const q = this.search.value.trim().toLowerCase()
    const items = this.candidates
      .filter((t) => !q || `${t.title} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .slice(0, 50)
    if (!items.length) {
      list.appendChild(el('div', { class: 'daily-assign-empty' }, 'No matching tasks'))
      return
    }
    for (const t of items) {
      const row = el(
        'button',
        { class: 'daily-assign-row', onClick: () => this.assign(t.id) },
        el('span', { class: 'daily-assign-row-title' }, `${t.issueKey ? t.issueKey + ' · ' : ''}${t.title}`),
        el('span', { class: 'daily-assign-row-meta' }, `${STATUS_LABEL[t.status]} · ${t.date}`)
      )
      list.appendChild(row)
    }
  }
}
