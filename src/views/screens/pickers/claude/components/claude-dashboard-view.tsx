import { Component } from '@geajs/core'
import { UITexts } from '@texts'
import { filterSessions, makeSessionRowClick } from '../claude.store'
import store from '../claude-dashboard.store'
import ClaudeSessionRow from './claude-session-row'

// Reactive body of the Claude sessions dashboard: heading, search box, and the
// live-filtered session list. Rendered as a JSX child of ClaudeDashboardView so gea
// tracks its store reads and re-renders it on every keystroke AND on each 1s timer
// refresh — the board pattern. A top-level, imperatively mounted component
// (ClaudeDashboardView) does not re-subscribe on store writes, so all reactive
// markup lives here.
class ClaudeDashboardList extends Component {
  declare props: { done: () => void }

  template({ done }: this['props']) {
    // Read the reactive store fields (the recollected session list + the search) so
    // this child re-renders on any keystroke AND after each timer refresh.
    const all = store.sessions
    const shown = filterSessions(all, store.search)

    return (
      <div class="claude-dashboard-picker">
        <h2>{UITexts.Pickers.claude.sessionsHeading}</h2>
        <input
          class="search-box-input"
          type="text"
          spellcheck="false"
          placeholder="Search sessions…"
          value={store.search}
          onInput={(e: Event) => store.setSearch((e.target as HTMLInputElement).value)}
        />
        <div class="pick-list picker-list">
          {shown.map((s) => (
            <ClaudeSessionRow key={s.paneId} session={s} onRowClick={makeSessionRowClick(s.paneId, done)} />
          ))}
          {shown.length === 0 && (
            <div class="empty-hint">{all.length === 0 ? 'No Claude sessions' : 'No matches'}</div>
          )}
        </div>
      </div>
    )
  }
}

// Thin shell for the sessions dashboard, mounted imperatively into the shared
// overlay modal. The teardown fn arrives via the constructor into a plain field — a
// gea Component only populates `this.props` when rendered from a parent template,
// not from a manual `new X()`. The reactive markup lives in the ClaudeDashboardList
// JSX child.
export default class ClaudeDashboardView extends Component {
  private readonly doneFn: () => void

  constructor(opts: { done: () => void }) {
    super()
    this.doneFn = opts.done
  }

  template() {
    return <ClaudeDashboardList done={this.doneFn} />
  }
}
