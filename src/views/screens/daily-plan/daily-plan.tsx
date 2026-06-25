import '@ui/screens/daily-plan/daily-plan.css'
import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import type { DailyRange } from '@ui/screens/daily-plan/daily-plan.types'
import { STATUSES, todayKey, formatHeader, projectTree } from '@ui/screens/daily-plan/daily-plan.state'
import { showTaskForm, openTagFilterPopover, tagFilter } from '@ui/screens/daily-plan/daily-plan'
import { showManageTagsModal as buildManageTagsModal } from '@ui/screens/daily-plan/components/manage-tags-modal'
import { showChangelogModal } from '@ui/screens/daily-plan/components/changelog-modal'
import BoardColumn from './components/board-column'
import store from './daily-plan.store'

// gea port of the Daily Plan board: a reactive header (date nav / range / project
// + tag filters) over the four columns. The legacy renderHeader/renderBoard
// closures rebuilt the DOM on every change via innerHTML=''; here the template is
// declarative and every control mutates the store, which gea patches surgically.
// Tag-manage / changelog reuse the legacy modals through co-existence.
const RANGES: { val: DailyRange; label: string }[] = [
  { val: 'day', label: UITexts.DailyPlan.range.today },
  { val: '3d', label: UITexts.DailyPlan.range.last3 },
  { val: '7d', label: UITexts.DailyPlan.range.last7 }
]

export default class DailyPlanBoard extends Component {
  private reload = (): void => store.reload()

  created(): void {
    store.reload()
  }

  template() {
    return (
      <div class="daily-plan-gea-root">
        <div class="daily-plan-header">
          <div class="daily-plan-title">Daily Plan</div>
          <div class="daily-plan-subtitle">{formatHeader(store.selectedDate)}</div>
          <div class="daily-plan-nav">
            <button
              class="daily-plan-nav-btn"
              title={UITexts.DailyPlan.prevDay}
              onClick={() => store.shiftSelectedDate(-1)}
            >
              ‹
            </button>
            <input
              type="date"
              class="daily-plan-date-input"
              value={store.selectedDate}
              onChange={(e: Event) => {
                const v = (e.target as HTMLInputElement).value
                if (v) store.setSelectedDate(v)
              }}
            />
            <button
              class="daily-plan-nav-btn"
              title={UITexts.DailyPlan.nextDay}
              onClick={() => store.shiftSelectedDate(1)}
            >
              ›
            </button>
            <button class="daily-plan-today-btn" onClick={() => store.setSelectedDate(todayKey())}>
              Today
            </button>
          </div>
          <div class="daily-plan-actions">
            <select
              class="settings-select daily-plan-range"
              onChange={(e: Event) => store.setRange((e.target as HTMLSelectElement).value as DailyRange)}
            >
              {RANGES.map((r) => (
                <option key={r.val} value={r.val} selected={r.val === store.selectedRange}>
                  {r.label}
                </option>
              ))}
            </select>
            <select
              class="settings-select daily-plan-range"
              onChange={(e: Event) => store.setProjectFilter((e.target as HTMLSelectElement).value || null)}
            >
              <option value="" selected={!store.projectFilter}>
                {UITexts.DailyPlan.allProjects}
              </option>
              {projectTree().map((entry) => (
                <option key={entry.p.id} value={entry.p.id} selected={entry.p.id === store.projectFilter}>
                  {'   '.repeat(entry.depth) + (entry.depth ? '└ ' : '') + entry.p.name}
                </option>
              ))}
            </select>
            {store.tags.length > 0 && (
              <button
                class={'daily-plan-secondary-btn daily-tagfilter-btn' + (tagFilter.size ? ' active' : '')}
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  openTagFilterPopover(e.currentTarget as HTMLElement, () => store.reload())
                }}
              >
                {tagFilter.size ? UITexts.DailyPlan.filterTagsCount(tagFilter.size) : UITexts.DailyPlan.filterTags}
              </button>
            )}
            <button class="daily-plan-primary-btn" onClick={() => showTaskForm(null, this.reload)}>
              + New task
            </button>
            <button
              class="daily-plan-secondary-btn"
              onClick={() => buildManageTagsModal({ rerender: this.reload, tagFilter: new Set(tagFilter) })}
            >
              Manage tags
            </button>
            <button
              class="daily-plan-secondary-btn"
              title={UITexts.DailyPlan.changelogTitle}
              onClick={() => showChangelogModal()}
            >
              Changelog
            </button>
          </div>
        </div>
        <div class="daily-plan-board">
          {STATUSES.map((s) => (
            <BoardColumn key={s.id} status={s.id} label={s.label} />
          ))}
        </div>
      </div>
    )
  }
}
