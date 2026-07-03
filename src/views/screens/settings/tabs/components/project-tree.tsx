import { Component } from '@geajs/core'
import type { ProjectTreeRowData } from './project-tree.state'
import ProjectTreeRow from './project-tree-row'

export interface ProjectTreeDeps {
  rows: ProjectTreeRowData[]
  hasProjects: boolean
  onSelect: (id: string) => void
  onAdd: () => void
}

// The left column of the Projects editor: an empty hint when there are no projects,
// one ProjectTreeRow per (flattened, indented) project, and "+ Add project". Mounted
// imperatively by the controller into the `.projects-md-list` host, so data arrives
// via the constructor; the display:contents root keeps the rows as direct children of
// the list column (§gea 5.8). Rebuilt one-shot on selection / structural change.
export default class ProjectTree extends Component {
  private readonly deps: ProjectTreeDeps

  constructor(deps: ProjectTreeDeps) {
    super()
    this.deps = deps
  }

  template() {
    const { rows, hasProjects, onSelect, onAdd } = this.deps
    return (
      <div style={{ display: 'contents' }}>
        {!hasProjects && <div class="field-hint">No projects yet.</div>}
        {rows.map((r) => (
          <ProjectTreeRow
            key={r.id}
            name={r.name}
            group={r.group}
            appsLabel={r.appsLabel}
            active={r.active}
            paddingLeft={r.paddingLeft}
            onSelect={() => onSelect(r.id)}
          />
        ))}
        <button class="settings-inline-btn" onClick={onAdd}>
          + Add project
        </button>
      </div>
    )
  }
}
