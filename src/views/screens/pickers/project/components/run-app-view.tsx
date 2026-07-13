import { Component } from '@geajs/core'
import RunAppRow from './run-app-row'

export interface RunAppRowData {
  env: string
  command: string
  onSplit: (e: Event) => void
  onTab: (e: Event) => void
}

export interface RunAppDeps {
  title: string
  emptyText: string
  rows: RunAppRowData[]
}

// Static body of the single-application run modal: heading + a list of per-
// environment run rows (each with Split / New tab), or an empty hint. Nothing here
// is reactive, so this is mounted imperatively as a single-render component. `deps`
// arrive via the constructor into a plain field.
export default class RunAppView extends Component {
  private readonly deps: RunAppDeps

  constructor(deps: RunAppDeps) {
    super()
    this.deps = deps
  }

  template() {
    const { title, emptyText, rows } = this.deps
    if (rows.length === 0) {
      return (
        <div class="project-picker">
          <h2>{title}</h2>
          <div class="empty-hint">{emptyText}</div>
        </div>
      )
    }
    return (
      <div class="project-picker">
        <h2>{title}</h2>
        <div class="pick-list picker-list">
          {rows.map((row, i) => (
            <RunAppRow
              key={row.env + ' ' + i}
              env={row.env}
              command={row.command}
              onSplit={row.onSplit}
              onTab={row.onTab}
            />
          ))}
        </div>
      </div>
    )
  }
}
