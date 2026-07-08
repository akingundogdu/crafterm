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
// mounting. Rendered as a JSX child (DetailCol) keyed by the selected project + detail
// epoch, so a fresh instance (with a fresh SubTabs) mounts only when the detail must
// truly rebuild; deps arrive via props. The display:contents root keeps the sub-tabs +
// actions as direct detail children (§gea 5.8).
export default class ProjectDetail extends Component {
  declare props: ProjectDetailDeps
  private hostEl: HTMLDivElement | null = null

  onAfterRender(): void {
    if (this.hostEl && !this.hostEl.firstChild) {
      buildSubTabs(this.hostEl, this.props.tabs, {
        initialIndex: this.props.initialIndex,
        onTabChange: this.props.onTabChange
      })
    }
  }

  template() {
    const { onAddSub, onDelete } = this.props
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
