import { Component } from '@geajs/core'
import { settings, requestSidebar } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { reconcileWorktrees, purgeWorktrees } from '@services/worktrees'
import type { ProjectNode } from '@views/types/types'
import LabeledTextField from '../../components/labeled-text-field'
import LabeledSelectControl from '../../components/labeled-select-control'
import { computeGroupOptions } from '../projects.store'

export interface GeneralTabDeps {
  renderTree: () => void
  renderGroups: () => void
}

// The General sub-tab of the selected project's editor: name / path / group / command
// / startup / shell / issue-key-prefix fields plus the "Support worktrees" checkbox.
// Mounted imperatively by the sub-tab build callback, so the RAW project node + the
// controller's re-render callbacks arrive via the constructor (never a proxied prop —
// §gea 5.3). Text fields are uncontrolled (LabeledTextField); the worktree checkbox is
// seeded in onAfterRender. The display:contents root keeps the fields as direct panel
// children (§gea 5.8). One-shot: rebuilt when the detail re-renders.
export default class GeneralTab extends Component {
  private readonly p: ProjectNode
  private readonly deps: GeneralTabDeps
  private wtCb: HTMLInputElement | null = null

  constructor(p: ProjectNode, deps: GeneralTabDeps) {
    super()
    this.p = p
    this.deps = deps
  }

  onAfterRender(): void {
    if (this.wtCb) this.wtCb.checked = !!this.p.supportWorktree
  }

  private nameChange = (v: string): void => {
    this.p.name = v.trim()
    this.deps.renderTree()
    requestSidebar()
    persistence.save()
  }

  private pathChange = (v: string): void => {
    this.p.path = v.trim()
    requestSidebar()
    persistence.save()
  }

  private groupChange = (v: string): void => {
    const g = v.trim()
    this.p.group = g || undefined
    if (g && !settings.groups.includes(g)) settings.groups.push(g)
    this.deps.renderTree()
    this.deps.renderGroups()
    requestSidebar()
    persistence.save()
  }

  private commandChange = (v: string): void => {
    this.p.command = v.trim() || undefined
    persistence.save()
  }

  private startupChange = (v: string): void => {
    this.p.startup = v.trim() || undefined
    persistence.save()
  }

  private shellChange = (v: string): void => {
    this.p.shell = v.trim() || undefined
    persistence.save()
  }

  private prefixChange = (v: string): void => {
    this.p.issueKeyPrefix = v.trim().toUpperCase() || undefined
    persistence.save()
  }

  private worktreeChange = (e: Event): void => {
    this.p.supportWorktree = (e.target as HTMLInputElement).checked
    persistence.save()
    requestSidebar()
    if (this.p.supportWorktree) void reconcileWorktrees()
    else purgeWorktrees(this.p)
  }

  template() {
    const p = this.p
    return (
      <div style={{ display: 'contents' }}>
        <LabeledTextField label="Name" value={p.name} placeholder="Movve" onChange={this.nameChange} />
        <LabeledTextField label="Path" value={p.path} placeholder="~/code/movve" onChange={this.pathChange} />
        <LabeledSelectControl
          label="Group (workspace)"
          value={p.group ?? ''}
          emptyLabel="(Ungrouped)"
          options={computeGroupOptions()}
          onChange={this.groupChange}
        />
        <LabeledTextField
          label="Command"
          value={p.command ?? ''}
          placeholder="claude (run on open, optional)"
          onChange={this.commandChange}
        />
        <LabeledTextField
          label="Startup command"
          value={p.startup ?? ''}
          placeholder="run in every terminal opened inside (optional)"
          onChange={this.startupChange}
        />
        <LabeledTextField
          label="Shell"
          value={p.shell ?? ''}
          placeholder="/bin/zsh (override, optional)"
          onChange={this.shellChange}
        />
        <LabeledTextField
          label="Issue key prefix"
          value={p.issueKeyPrefix ?? ''}
          placeholder="CRF (for CRF-12 task keys, optional)"
          onChange={this.prefixChange}
        />
        <div class="field">
          <label style={{ cursor: 'pointer' }}>
            <input type="checkbox" style={{ marginRight: '8px' }} ref={this.wtCb} onChange={this.worktreeChange} />
            <span>Support worktrees (list git worktrees as folders)</span>
          </label>
        </div>
      </div>
    )
  }
}
