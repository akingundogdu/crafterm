import { Component } from '@geajs/core'
import type { DailyPlanTask, DailyPlanStatus } from '@views/types/types'
import type { DailyRange } from '@views/screens/daily-plan/daily-plan.types'
import store from './daily-compact.store'
import CompactInner from './compact-inner'

// Board-owned shared state the compact view reads/writes. Range, compact status
// and search are the source of truth in the reactive compact store; the getters/
// setters here delegate to it (daily-plan.entry). activeDailyRerender lets the
// global Cmd+N shortcut / pane-assignment refresh the docked view.
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
  openTaskInTerminal: (task: DailyPlanTask, onChange: () => void, useWorktree?: boolean) => void
}

// Compact Daily Plan view for the narrow Notebook sub-tab. This top-level, imperatively
// mounted shell owns nothing reactive (gea does not re-subscribe an imperatively
// rendered root on store writes); the reactive tabs / search / list live in the
// CompactInner JSX child, which re-renders itself on store changes. `deps` are handed
// in by renderDailyCompactView just before mount and captured in created().
let pendingDeps: DailyCompactDeps | null = null

export default class DailyCompact extends Component {
  private deps!: DailyCompactDeps

  created(): void {
    this.deps = pendingDeps as DailyCompactDeps
    // Register the external re-render hook (Cmd+N / pane-assignment refresh) as a
    // store bump — CompactInner reads store.rev, so the bump refreshes it.
    this.deps.setActiveDailyRerender(() => store.bump())
  }

  template() {
    return <CompactInner deps={this.deps} />
  }
}

export function renderDailyCompactView(host: HTMLElement, deps: DailyCompactDeps): void {
  host.innerHTML = ''
  pendingDeps = deps
  new DailyCompact().render(host)
}
