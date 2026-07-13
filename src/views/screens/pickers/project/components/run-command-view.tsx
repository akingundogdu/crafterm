import { Component } from '@geajs/core'
import RunCommandRow from './run-command-row'

export interface RunCommandRowData {
  name: string
  command: string
  onSplit: (e: Event) => void
  onTab: (e: Event) => void
}

export interface RunCommandDeps {
  title: string
  emptyText: string
  rows: RunCommandRowData[]
}

// Static body of the run-command modal: heading + a list of named run-command rows
// (each with Split / New tab), or an empty hint. Nothing here is reactive, so this
// is mounted imperatively as a single-render component. `deps` arrive via the
// constructor into a plain field.
export default class RunCommandView extends Component {
  private readonly deps: RunCommandDeps

  constructor(deps: RunCommandDeps) {
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
            <RunCommandRow
              key={row.name + ' ' + i}
              name={row.name}
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
