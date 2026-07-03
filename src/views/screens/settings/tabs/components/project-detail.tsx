import { Component } from '@geajs/core'
import { buildSubTabs } from '../../shared'
import type { SubTab } from '../../shared.types'

export interface ProjectDetailDeps {
  tabs: SubTab[]
  initialIndex: number
  onTabChange: (idx: number) => void
  onAddSub: () => void
  onDelete: () => void
}

// The right column of the Projects editor for the selected project: the sub-tab strip
// (General / Environment / Apps / Features / Run commands / iOS) over a `.proj-detail-
// actions` footer. buildSubTabs is an imperative gea mount, so it runs in onAfterRender
// against a host ref (§gea 5.11); the `!firstChild` guard keeps a re-render from double-
// mounting. Mounted imperatively into `.projects-md-detail`, so deps arrive via the
// constructor; the display:contents root keeps the sub-tabs + actions as direct detail
// children (§gea 5.8).
export default class ProjectDetail extends Component {
  private readonly deps: ProjectDetailDeps
  private hostEl: HTMLDivElement | null = null

  constructor(deps: ProjectDetailDeps) {
    super()
    this.deps = deps
  }

  onAfterRender(): void {
    if (this.hostEl && !this.hostEl.firstChild) {
      buildSubTabs(this.hostEl, this.deps.tabs, {
        initialIndex: this.deps.initialIndex,
        onTabChange: this.deps.onTabChange
      })
    }
  }

  template() {
    const { onAddSub, onDelete } = this.deps
    return (
      <div style={{ display: 'contents' }}>
        <div ref={this.hostEl} />
        <div class="proj-detail-actions">
          <button class="settings-inline-btn" onClick={onAddSub}>
            + Add sub-project
          </button>
          <button class="settings-inline-btn project-del-btn" onClick={onDelete}>
            Delete project
          </button>
        </div>
      </div>
    )
  }
}
