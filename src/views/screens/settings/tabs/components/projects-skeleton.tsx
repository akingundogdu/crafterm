import { Component } from '@geajs/core'

export interface ProjectsSkeletonDeps {
  heading: string
  askProjectText: string
  environmentsText: string
  groupsText: string
  askProjectInitial: boolean
  onAskProjectChange: (checked: boolean) => void
}

// The static shell of the Projects panel: the heading, the "ask which project on a new
// terminal" checkbox, the Environments / Groups sub-heads with their (empty) `.env-bar`
// hosts, and the `.projects-md` two-column layout with empty list / detail hosts. The
// controller mounts this once, then fills the four hosts (env bar, group bar, tree, and
// detail) by querying them off the panel. Mounted imperatively, so deps arrive via the
// constructor; the askProject checkbox is uncontrolled (seeded in onAfterRender). The
// display:contents root keeps every element a direct child of the settings panel (§gea
// 5.8), matching the legacy DOM byte-for-byte.
export default class ProjectsSkeleton extends Component {
  private readonly deps: ProjectsSkeletonDeps
  private askCb: HTMLInputElement | null = null

  constructor(deps: ProjectsSkeletonDeps) {
    super()
    this.deps = deps
  }

  onAfterRender(): void {
    if (this.askCb) this.askCb.checked = this.deps.askProjectInitial
  }

  template() {
    const { heading, askProjectText, environmentsText, groupsText, onAskProjectChange } = this.deps
    return (
      <div style={{ display: 'contents' }}>
        <h3>{heading}</h3>
        <label class="checkbox-row">
          <input
            type="checkbox"
            ref={this.askCb}
            onChange={(e: Event) => onAskProjectChange((e.target as HTMLInputElement).checked)}
          />
          {askProjectText}
        </label>
        <div class="settings-subhead">{environmentsText}</div>
        <div class="env-bar" />
        <div class="settings-subhead">{groupsText}</div>
        <div class="env-bar" />
        <div class="projects-md">
          <div class="projects-md-list" />
          <div class="projects-md-detail" />
        </div>
      </div>
    )
  }
}
