import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'
import { boardColumnOf } from '@views/screens/daily-plan/task-helpers'
import { STATUSES } from '@views/screens/daily-plan/daily-plan.state'
import CompactCard from './compact-card'
import store from './daily-compact.store'
import type { DailyCompactDeps } from './daily-compact'

const RANGES: { val: DailyRange; label: string }[] = [
  { val: 'day', label: UITexts.DailyPlan.range.today },
  { val: '3d', label: UITexts.DailyPlan.range.last3 },
  { val: '7d', label: UITexts.DailyPlan.range.last7 }
]

// Reactive body of the compact Daily Plan view. It is rendered as a JSX child of
// DailyCompact so gea tracks its store reads and re-renders it on every status /
// search / range change — the board-column pattern. A top-level, imperatively
// mounted component (DailyCompact itself) does not re-subscribe on store writes, so
// all reactive markup lives here.
export default class CompactInner extends Component {
  declare props: { deps: DailyCompactDeps }

  private rerender = (): void => store.bump()

  template({ deps }: this['props']) {
    // Subscribe to the reactive store fields (source of truth) + rev (external
    // activeDailyRerender) so this child re-renders on any compact-view change.
    void store.rev
    const tasks = deps.tasksForScope()
    const status = store.status
    const range = store.range
    const search = store.search
    const q = search.trim().toLowerCase()
    const items = tasks
      .filter((t) => boardColumnOf(t.status) === status)
      .filter((t) => !q || `${t.title} ${t.description ?? ''} ${t.issueKey ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.order - b.order)

    return (
      <div class="daily-compact">
        <div class="daily-compact-toolbar">
          <div class="daily-compact-title">Daily Plan</div>
          <button
            class="daily-compact-full"
            title={UITexts.DailyPlan.openBoardTitle}
            onClick={() => deps.showDailyPlanModal(deps.getSelectedDate())}
          >
            ⛶
          </button>
          <select
            class="settings-select daily-compact-range"
            onChange={(e: Event) => deps.setSelectedRange((e.target as HTMLSelectElement).value as DailyRange)}
          >
            {RANGES.map((r) => (
              <option key={r.val} value={r.val} selected={r.val === range}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            class="daily-plan-primary-btn daily-compact-new"
            onClick={() => deps.showTaskForm(null, this.rerender, status)}
          >
            + New
          </button>
        </div>
        <div class="daily-compact-tabs">
          {STATUSES.map((s) => {
            const count = tasks.filter((t) => boardColumnOf(t.status) === s.id).length
            return (
              <button
                key={s.id}
                class={'daily-compact-tab' + (status === s.id ? ' active' : '')}
                onClick={() => deps.setCompactStatus(s.id)}
              >
                <span>{s.label}</span>
                <span class="daily-compact-tab-count">{String(count)}</span>
              </button>
            )
          })}
        </div>
        <input
          type="text"
          class="nb-subtab-search"
          placeholder={UITexts.DailyPlan.searchTasks}
          value={search}
          onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
          onInput={(e: Event) => deps.setCompactSearch((e.target as HTMLInputElement).value)}
        />
        <div class="daily-compact-list">
          {items.map((task) => (
            <CompactCard
              key={task.id}
              task={task}
              rerender={this.rerender}
              getSelectedRange={deps.getSelectedRange}
              openTaskInTerminal={deps.openTaskInTerminal}
              showTaskForm={deps.showTaskForm}
            />
          ))}
          {items.length === 0 && (
            <div class="daily-compact-empty">{q ? 'No matching tasks' : 'No tasks here'}</div>
          )}
        </div>
      </div>
    )
  }
}
