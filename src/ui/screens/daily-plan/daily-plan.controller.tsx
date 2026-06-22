import { UITexts } from '@texts'
import type { DailyPlanTask, DailyPlanStatus } from '@ui/types/types'
import type { DailyRange } from './daily-plan.types'
import { dailyTaskRepo } from '@repositories'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { createOverlay } from '@ui/components'
import { boardColumnOf } from './task-helpers'
import { STATUSES, todayKey } from './daily-plan.state'

// Board-owned shared state + helpers the modal controller drives. The board
// keeps this state module-level (it is shared with the pane-assignment helpers),
// so it is handed to the controller rather than owned by it.
export interface DailyPlanModalDeps {
  setSelectedDate: (date: string) => void
  showTaskForm: (existing: DailyPlanTask | null, onSaved: () => void, defaultStatus?: DailyPlanStatus) => void
  renderHeader: (host: HTMLElement, rerender: () => void) => void
  renderBoard: (host: HTMLElement, rerender: () => void) => void
}

// Wide board modal: header (date controls + actions) over the four-column board.
// Owns its overlay + per-open render closure; the board state and helpers come
// from the board module via deps.
export class DailyPlanModalController {
  private readonly deps: DailyPlanModalDeps
  private header!: HTMLDivElement
  private board!: HTMLDivElement

  constructor(deps: DailyPlanModalDeps) {
    this.deps = deps
  }

  open(initialDate?: string, focusTaskId?: string): void {
    const deps = this.deps
    deps.setSelectedDate(initialDate ?? todayKey())

    const { overlay, mount, close, onClose } = createOverlay()

    const render = (): void => {
      deps.renderHeader(this.header, render)
      deps.renderBoard(this.board, render)
    }

    const onKey = (e: KeyboardEvent): void => {
      // Defer to a child form modal or an open tag-filter popover (they handle Esc).
      if (document.querySelector('.daily-plan-form-overlay') || document.querySelector('.daily-tagfilter-pop')) return
      e.stopPropagation()
      if (e.key === 'Escape') {
        close()
      } else if (e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        // Cmd+N opens the new-task form while the board modal is up (todo8 — the
        // global handler surrenders to open modals, so the modal owns this).
        e.preventDefault()
        deps.showTaskForm(null, render)
      }
    }
    onClose(() => document.removeEventListener('keydown', onKey, true))
    document.addEventListener('keydown', onKey, true)

    this.header = (<div class="daily-plan-header" />) as HTMLDivElement
    this.board = (<div class="daily-plan-board" />) as HTMLDivElement

    const modal = (
      <div class="modal daily-plan-modal">
        {makeCloseButton(close)}
        {this.header}
        {this.board}
      </div>
    ) as HTMLDivElement
    overlay.appendChild(modal)

    render()

    mount()

    // Deep-link: open the edit form for a specific task (e.g. from a reminder card).
    if (focusTaskId) {
      const task = dailyTaskRepo.getAll().find((t) => t.id === focusTaskId)
      if (task) deps.showTaskForm(task, render)
    }
  }
}

// Board-owned shared state the compact view reads/writes. Range, compact status
// and search persist across re-renders; activeDailyRerender lets the global
// Cmd+N shortcut refresh the docked view.
export interface DailyCompactDeps {
  getSelectedRange: () => DailyRange
  setSelectedRange: (range: DailyRange) => void
  getCompactStatus: () => DailyPlanStatus
  setCompactStatus: (status: DailyPlanStatus) => void
  getCompactSearch: () => string
  setCompactSearch: (search: string) => void
  setActiveDailyRerender: (render: () => void) => void
  getSelectedDate: () => string
  tasksForScope: () => DailyPlanTask[]
  showDailyPlanModal: (initialDate?: string) => void
  showTaskForm: (existing: DailyPlanTask | null, onSaved: () => void, defaultStatus?: DailyPlanStatus) => void
  renderCard: (task: DailyPlanTask, rerender: () => void) => HTMLElement
}

// Compact Daily Plan view for the narrow Notebook sub-tab: a status tab strip
// (Backlog/Todo/In Progress/Done) + a search box + a single filtered card list,
// plus a full-screen button that opens the wide board modal. No per-day
// navigation — only the range dropdown (today / last N days).
export class DailyCompactController {
  private readonly deps: DailyCompactDeps
  private readonly host: HTMLElement
  private listHost!: HTMLDivElement
  private tasks: DailyPlanTask[] = []

  constructor(host: HTMLElement, deps: DailyCompactDeps) {
    this.host = host
    this.deps = deps
  }

  render(): void {
    const deps = this.deps
    const host = this.host
    host.innerHTML = ''
    host.classList.add('daily-compact')
    const render = (): void => this.render()
    deps.setActiveDailyRerender(render)

    this.tasks = deps.tasksForScope()
    const tasks = this.tasks

    // --- Toolbar: title · fullscreen · range · new task --------------------
    const rangeSel = (
      <select
        class="settings-select daily-compact-range"
        onChange={() => {
          deps.setSelectedRange(rangeSel.value as DailyRange)
          render()
        }}
      >
        {(
          [
            ['day', UITexts.DailyPlan.range.today],
            ['3d', UITexts.DailyPlan.range.last3],
            ['7d', UITexts.DailyPlan.range.last7]
          ] as const
        ).map(([val, label]) => (
          <option value={val} selected={val === deps.getSelectedRange()}>
            {label}
          </option>
        ))}
      </select>
    ) as HTMLSelectElement

    const toolbar = (
      <div class="daily-compact-toolbar">
        <div class="daily-compact-title">Daily Plan</div>
        <button
          class="daily-compact-full"
          title={UITexts.DailyPlan.openBoardTitle}
          onClick={() => deps.showDailyPlanModal(deps.getSelectedDate())}
        >
          ⛶
        </button>
        {rangeSel}
        <button
          class="daily-plan-primary-btn daily-compact-new"
          onClick={() => deps.showTaskForm(null, render, deps.getCompactStatus())}
        >
          + New
        </button>
      </div>
    ) as HTMLDivElement
    host.appendChild(toolbar)

    // --- Status tab strip (counts per status, current scope) ---------------
    const tabs = (
      <div class="daily-compact-tabs">
        {STATUSES.map((status) => {
          const count = tasks.filter((t) => boardColumnOf(t.status) === status.id).length
          return (
            <button
              class={'daily-compact-tab' + (deps.getCompactStatus() === status.id ? ' active' : '')}
              onClick={() => {
                deps.setCompactStatus(status.id)
                render()
              }}
            >
              <span>{status.label}</span>
              <span class="daily-compact-tab-count">{String(count)}</span>
            </button>
          )
        })}
      </div>
    ) as HTMLDivElement
    host.appendChild(tabs)

    // --- Search ------------------------------------------------------------
    const search = (
      <input
        type="text"
        class="nb-subtab-search"
        placeholder={UITexts.DailyPlan.searchTasks}
        onKeydown={(e: KeyboardEvent) => e.stopPropagation()}
        onInput={() => {
          deps.setCompactSearch(search.value)
          this.fillList()
        }}
      />
    ) as HTMLInputElement
    search.value = deps.getCompactSearch()
    host.appendChild(search)

    // --- Card list (selected status, filtered by search) -------------------
    this.listHost = (<div class="daily-compact-list" />) as HTMLDivElement
    host.appendChild(this.listHost)

    this.fillList()
  }

  private fillList = (): void => {
    const deps = this.deps
    const listHost = this.listHost
    listHost.replaceChildren()
    const q = deps.getCompactSearch().trim().toLowerCase()
    const items = this.tasks
      .filter((t) => boardColumnOf(t.status) === deps.getCompactStatus())
      .filter((t) => !q || `${t.title} ${t.description ?? ''} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.order - b.order)
    if (!items.length) {
      const empty = (
        <div class="daily-compact-empty">{q ? 'No matching tasks' : 'No tasks here'}</div>
      ) as HTMLDivElement
      listHost.appendChild(empty)
      return
    }
    const render = (): void => this.render()
    for (const task of items) listHost.appendChild(deps.renderCard(task, render))
  }
}
