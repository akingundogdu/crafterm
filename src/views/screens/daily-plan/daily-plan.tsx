import { Component } from '@geajs/core'
import './daily-plan.css'
import { UITexts } from '@texts'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'
import { STATUSES, RANGES, todayKey, formatHeader } from '@views/screens/daily-plan/daily-plan.store'
import ProjectSelect from '@views/components/project-select/project-select'
import { showTaskForm, openTagFilterPopover, tagFilter } from './daily-plan.entry'
import { showManageTagsModal as buildManageTagsModal } from './components/manage-tags-modal'
import { showChangelogModal } from './components/changelog-modal'
import BoardColumn from './components/board-column'
import store from './daily-plan.store'

// gea port of the Daily Plan board: a reactive header (date nav / range / project
// + tag filters) over the four columns. The legacy renderHeader/renderBoard
// closures rebuilt the DOM on every change via innerHTML=''; here the template is
// declarative and every control mutates the store, which gea patches surgically.
// Tag-manage / changelog reuse the legacy modals through co-existence.
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
            <ProjectSelect
              value={store.projectFilter ?? ''}
              emptyLabel={UITexts.DailyPlan.allProjects}
              selectClass="settings-select daily-plan-range"
              onChange={(id: string) => store.setProjectFilter(id || null)}
            />
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
