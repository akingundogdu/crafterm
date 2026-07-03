import { Component } from '@geajs/core'
import { applicationRepo } from '@repositories'
import AppCard from './app-card'
import store from './apps-section.store'

// Chrome the Apps section needs from the controller. `environments` is a snapshot of
// settings.environments captured when the section is (re)built; the controller
// rebuilds the detail (hence this section) whenever the environment list changes, so
// it stays accurate. `renderTree` refreshes the left column's "N apps" badge.
export interface AppsSectionDeps {
  environments: string[]
  uid: (prefix: string) => string
  renderTree: () => void
}

// Reactive body of the Apps section: the "Applications" heading, an empty hint, one
// AppCard per application, and the "+ Add application" button. Rendered as a JSX
// child of AppsSection so gea tracks its `store.apps` read and re-renders it on every
// add / remove / run-command change (the ssh/action-menu pattern; an imperatively
// mounted root would not re-subscribe). Every mutation resolves the RAW app object
// from the repo before touching it (§gea 5.3), persists through applicationRepo, then
// reloads the store to reassign the mirrored array.
class AppsBody extends Component {
  declare props: { deps: AppsSectionDeps }

  private get pid(): string {
    return store.projectId
  }

  private onNameChange = (appId: string, v: string): void => {
    const app = applicationRepo.get(appId)
    if (!app) return
    app.name = v.trim()
    applicationRepo.upsert(this.pid, app)
    store.reload(this.pid) // refresh the card title
    this.props.deps.renderTree()
  }

  private onPathChange = (appId: string, v: string): void => {
    const app = applicationRepo.get(appId)
    if (!app) return
    app.path = v.trim() || undefined
    applicationRepo.upsert(this.pid, app)
  }

  private onOpensAsChange = (appId: string, v: string): void => {
    const app = applicationRepo.get(appId)
    if (!app) return
    app.opensAs = v as 'tab' | 'split'
    applicationRepo.upsert(this.pid, app)
  }

  private onCommandChange = (appId: string, env: string, v: string): void => {
    const app = applicationRepo.get(appId)
    if (!app) return
    const t = v.trim()
    if (t) app.commands[env] = t
    else delete app.commands[env]
    applicationRepo.upsert(this.pid, app)
  }

  private onAddRunCommand = (appId: string): void => {
    const app = applicationRepo.get(appId)
    if (!app) return
    app.runCommands = [...(app.runCommands ?? []), { id: this.props.deps.uid('rc'), name: 'command', command: '' }]
    applicationRepo.upsert(this.pid, app)
    store.reload(this.pid)
  }

  private onRunCommandNameChange = (appId: string, rcId: string, v: string): void => {
    const app = applicationRepo.get(appId)
    const rc = app?.runCommands?.find((x) => x.id === rcId)
    if (!app || !rc) return
    rc.name = v.trim() || rc.name
    applicationRepo.upsert(this.pid, app)
  }

  private onRunCommandChange = (appId: string, rcId: string, v: string): void => {
    const app = applicationRepo.get(appId)
    const rc = app?.runCommands?.find((x) => x.id === rcId)
    if (!app || !rc) return
    rc.command = v.trim()
    applicationRepo.upsert(this.pid, app)
  }

  private onDeleteRunCommand = (appId: string, rcId: string): void => {
    const app = applicationRepo.get(appId)
    if (!app) return
    app.runCommands = (app.runCommands ?? []).filter((x) => x.id !== rcId)
    applicationRepo.upsert(this.pid, app)
    store.reload(this.pid)
  }

  private onDeleteApp = (appId: string): void => {
    applicationRepo.remove(this.pid, appId)
    store.reload(this.pid)
    this.props.deps.renderTree()
  }

  private onAddApp = (): void => {
    applicationRepo.upsert(this.pid, { id: this.props.deps.uid('app'), name: 'app', commands: {} })
    store.reload(this.pid)
    this.props.deps.renderTree()
  }

  template({ deps }: this['props']) {
    const apps = store.apps
    return (
      <div style={{ display: 'contents' }}>
        <div class="settings-subhead">Applications</div>
        {apps.length === 0 && (
          <div class="field-hint">No applications. Add one to run it (with per-environment commands).</div>
        )}
        {apps.map((app) => (
          <AppCard
            key={app.id}
            name={app.name}
            path={app.path ?? ''}
            opensAs={app.opensAs}
            commands={app.commands ?? {}}
            runCommands={app.runCommands ?? []}
            environments={deps.environments}
            onNameChange={(v: string) => this.onNameChange(app.id, v)}
            onPathChange={(v: string) => this.onPathChange(app.id, v)}
            onOpensAsChange={(v: string) => this.onOpensAsChange(app.id, v)}
            onCommandChange={(env: string, v: string) => this.onCommandChange(app.id, env, v)}
            onAddRunCommand={() => this.onAddRunCommand(app.id)}
            onRunCommandNameChange={(rcId: string, v: string) => this.onRunCommandNameChange(app.id, rcId, v)}
            onRunCommandChange={(rcId: string, v: string) => this.onRunCommandChange(app.id, rcId, v)}
            onDeleteRunCommand={(rcId: string) => this.onDeleteRunCommand(app.id, rcId)}
            onDeleteApp={() => this.onDeleteApp(app.id)}
          />
        ))}
        <button class="settings-inline-btn" onClick={this.onAddApp}>
          + Add application
        </button>
      </div>
    )
  }
}

// Thin shell for the Apps section, mounted imperatively into its sub-tab panel host.
// `deps` arrive via the constructor into a plain field (a manual `new X()` never
// populates `this.props`); the reactive markup lives in the AppsBody JSX child. The
// display:contents root lets the body's children lay out as direct panel children
// (§gea 5.8), matching the legacy section that appended siblings straight to the host.
export default class AppsSection extends Component {
  private readonly deps: AppsSectionDeps

  constructor(deps: AppsSectionDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <AppsBody deps={this.deps} />
  }
}
