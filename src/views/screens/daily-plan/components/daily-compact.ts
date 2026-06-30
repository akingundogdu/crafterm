import { UITexts } from '@texts'
import type { DailyPlanTask, DailyPlanStatus } from '@views/types/types'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'
import { el } from '@views/lib/dom'
import { boardColumnOf } from '@views/screens/daily-plan/task-helpers'
import { STATUSES } from '@views/screens/daily-plan/daily-plan.state'

// Board-owned shared state the compact view reads/writes. Range, compact status
// and search persist across re-renders; activeDailyRerender lets the global Cmd+N
// shortcut refresh the docked view.
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
// plus a full-screen button that opens the wide board modal. No per-day navigation
// — only the range dropdown (today / last N days). Plain-DOM port (§2.7).
class DailyCompact {
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
    const rangeSel = el(
      'select',
      {
        class: 'settings-select daily-compact-range',
        onChange: () => {
          deps.setSelectedRange(rangeSel.value as DailyRange)
          render()
        }
      },
      ...(
        [
          ['day', UITexts.DailyPlan.range.today],
          ['3d', UITexts.DailyPlan.range.last3],
          ['7d', UITexts.DailyPlan.range.last7]
        ] as const
      ).map(([val, label]) => {
        const o = el('option', { value: val }, label)
        if (val === deps.getSelectedRange()) o.selected = true
        return o
      })
    )

    const toolbar = el(
      'div',
      { class: 'daily-compact-toolbar' },
      el('div', { class: 'daily-compact-title' }, 'Daily Plan'),
      el(
        'button',
        {
          class: 'daily-compact-full',
          title: UITexts.DailyPlan.openBoardTitle,
          onClick: () => deps.showDailyPlanModal(deps.getSelectedDate())
        },
        '⛶'
      ),
      rangeSel,
      el(
        'button',
        {
          class: 'daily-plan-primary-btn daily-compact-new',
          onClick: () => deps.showTaskForm(null, render, deps.getCompactStatus())
        },
        '+ New'
      )
    )
    host.appendChild(toolbar)

    // --- Status tab strip (counts per status, current scope) ---------------
    const tabs = el('div', { class: 'daily-compact-tabs' })
    for (const status of STATUSES) {
      const count = tasks.filter((t) => boardColumnOf(t.status) === status.id).length
      tabs.appendChild(
        el(
          'button',
          {
            class: 'daily-compact-tab' + (deps.getCompactStatus() === status.id ? ' active' : ''),
            onClick: () => {
              deps.setCompactStatus(status.id)
              render()
            }
          },
          el('span', null, status.label),
          el('span', { class: 'daily-compact-tab-count' }, String(count))
        )
      )
    }
    host.appendChild(tabs)

    // --- Search ------------------------------------------------------------
    const search = el('input', {
      type: 'text',
      class: 'nb-subtab-search',
      placeholder: UITexts.DailyPlan.searchTasks,
      onKeydown: (e: KeyboardEvent) => e.stopPropagation(),
      onInput: () => {
        deps.setCompactSearch(search.value)
        this.fillList()
      }
    })
    search.value = deps.getCompactSearch()
    host.appendChild(search)

    // --- Card list (selected status, filtered by search) -------------------
    this.listHost = el('div', { class: 'daily-compact-list' })
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
      listHost.appendChild(el('div', { class: 'daily-compact-empty' }, q ? 'No matching tasks' : 'No tasks here'))
      return
    }
    const render = (): void => this.render()
    for (const task of items) listHost.appendChild(deps.renderCard(task, render))
  }
}

export function renderDailyCompactView(host: HTMLElement, deps: DailyCompactDeps): void {
  new DailyCompact(host, deps).render()
}
