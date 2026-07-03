import type { ProjectNode, Application } from '@views/types/types'
import { settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { runApplications, createFeature, resolveAppPath } from '@views/commands/commands'
import { overlayModal } from '../shared'
import { buildProjectEntries, stepSelection, makeChoose, makeRunSplit, makeRunTab } from './project.state'
import projectStore, { type ProjectPickRow } from './project.store'
import runAppsStore from './run-apps.store'
import featureStore from './feature-setup.store'
import ProjectPickerView, { type ProjectPickerDeps } from './components/project-picker-view'
import RunAppsView, { type RunAppsDeps } from './components/run-apps-view'
import RunCommandView, { type RunCommandRowData } from './components/run-command-view'
import RunAppView, { type RunAppRowData } from './components/run-app-view'
import FeatureSetupView, { type FeatureSetupDeps } from './components/feature-setup-view'

// Owns the project picker overlay: builds the modal, mounts the gea picker view,
// and drives keyboard navigation. The reactive DOM (search + filtered list) lives
// in ProjectPickerView / ProjectList reading project.store; this class owns the
// entry construction + selection/keyboard handling and pushes it into the store,
// which is why it stays here rather than in the stateless state.
export class ProjectPickerController {
  private readonly parentFolderId: string | null
  private readonly splitMode: boolean

  private close!: () => void

  constructor(parentFolderId: string | null, opts?: { split?: boolean }) {
    this.parentFolderId = parentFolderId
    this.splitMode = !!opts?.split
  }

  open(): void {
    const { modal, close } = overlayModal('picker-modal')
    this.close = close

    const entries = buildProjectEntries(this.parentFolderId, (p) => new RunAppsController(p).open())
    const choose = makeChoose(close, this.splitMode)
    const rows: ProjectPickRow[] = entries.map((e) => ({
      label: e.label,
      sub: e.sub,
      filterText: e.label + ' ' + (e.sub ?? ''),
      onChoose: (split: boolean) => choose(e, split)
    }))
    projectStore.set(rows)

    const deps: ProjectPickerDeps = {
      title: this.splitMode ? UITexts.Pickers.project.split : UITexts.Pickers.project.open,
      placeholder: this.splitMode
        ? UITexts.Pickers.project.splitPlaceholder
        : UITexts.Pickers.project.openPlaceholder,
      onHover: (i) => projectStore.setSel(i),
      onKeyDown: this.onKey
    }
    new ProjectPickerView(deps).render(modal)
    ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = projectStore.visible()
    if (e.key === 'Escape') this.close()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      projectStore.setSel(stepSelection(e.key, projectStore.sel, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = items[projectStore.sel]
      if (row) row.onChoose(e.metaKey || e.ctrlKey)
    }
  }
}

// Modal for one project: choose an environment, tick apps, run them together.
export class RunAppsController {
  private readonly project: ProjectNode
  private readonly apps: Application[]
  private readonly env: string

  constructor(project: ProjectNode) {
    this.project = project
    this.apps = project.apps ?? []
    this.env = settings.environments[0]
  }

  open(): void {
    const { modal, close } = overlayModal('picker-modal')
    const empty = !this.apps.length || !settings.environments.length
    const emptyText = empty
      ? `${
          this.apps.length ? UITexts.Pickers.project.noEnvironments : UITexts.Pickers.project.noApplications
        } Add them in Settings → Projects.`
      : null
    if (!empty) runAppsStore.reset(this.apps, this.env)

    const deps: RunAppsDeps = {
      title: `Run — ${this.project.name}`,
      emptyText,
      environments: settings.environments,
      close,
      onRun: () => {
        const selected = runAppsStore.selected()
        if (selected.length) void runApplications(this.project, runAppsStore.env, selected)
        close()
      }
    }
    new RunAppsView(deps).render(modal)
  }
}

// Project-specific named commands: a list with two run options per row —
// "Split" (drop into a split beside the active pane) and "New tab" (open as
// its own terminal under the project). Both spawn at the project's path.
export class RunCommandController {
  private readonly project: ProjectNode

  constructor(project: ProjectNode) {
    this.project = project
  }

  open(): void {
    const cmds = this.project.runCommands ?? []
    const { modal, close } = overlayModal('picker-modal')
    const rows: RunCommandRowData[] = cmds.map((rc) => {
      const target = {
        name: rc.name,
        path: this.project.path,
        command: rc.command,
        env: this.project.env,
        shell: this.project.shell
      }
      return {
        name: rc.name,
        command: rc.command,
        onSplit: makeRunSplit(target, close),
        onTab: makeRunTab(target, this.project.id, close)
      }
    })
    new RunCommandView({
      title: `Run command — ${this.project.name}`,
      emptyText: 'No run commands. Add them in Settings → Projects.',
      rows
    }).render(modal)
  }
}

// Launch a single application (from the pane ⋯ menu). Lists each environment the
// app has a command for; Split runs it beside the active pane, New tab opens it in
// a fresh tab under the project. The project's startup is chained before the dev
// command, matching runApplications().
export class RunAppController {
  private readonly project: ProjectNode
  private readonly app: Application

  constructor(project: ProjectNode, app: Application) {
    this.project = project
    this.app = app
  }

  open(): void {
    const envs = settings.environments.filter((e) => (this.app.commands?.[e] ?? '').trim())
    const { modal, close } = overlayModal('picker-modal')
    const appPath = resolveAppPath(this.project.path, this.app.path)
    const startup = this.project.startup?.trim()
    const rows: RunAppRowData[] = envs.map((env) => {
      const dev = (this.app.commands[env] ?? '').trim()
      const command = startup ? `${startup} && ${dev}` : dev
      const target = {
        name: `${this.app.name} · ${env}`,
        path: appPath,
        command,
        env: this.project.env,
        shell: this.project.shell
      }
      return {
        env,
        command: dev,
        onSplit: makeRunSplit(target, close),
        onTab: makeRunTab(target, this.project.id, close)
      }
    })
    new RunAppView({
      title: `Run ${this.app.name} — ${this.project.name}`,
      emptyText: 'No commands configured for this application. Add them in Settings → Projects.',
      rows
    }).render(modal)
  }
}

// Feature setup: feature name + branch + env + apps (+ per-app worktree).
export class FeatureSetupController {
  private readonly project: ProjectNode
  private readonly apps: Application[]
  private readonly hasApps: boolean
  private readonly env: string

  constructor(project: ProjectNode) {
    this.project = project
    this.apps = project.apps ?? []
    this.hasApps = this.apps.length > 0 && settings.environments.length > 0
    this.env = settings.environments[0] ?? ''
  }

  open(): void {
    const { modal, close } = overlayModal('picker-modal')
    featureStore.reset(this.hasApps ? this.apps : [], this.env)

    const emptyText = `${
      this.apps.length
        ? UITexts.Pickers.project.noEnvironmentsConfigured
        : UITexts.Pickers.project.noApplicationsDefined
    } The feature folder will be created without any auto-spawned terminals. Define apps in Settings → Projects to launch them automatically.`

    const deps: FeatureSetupDeps = {
      title: `New feature — ${this.project.name}`,
      hasApps: this.hasApps,
      emptyText,
      environments: settings.environments,
      close,
      onCreate: ({ branch, base, chosen }) => {
        void createFeature(this.project, { branch, base, env: featureStore.env, apps: chosen })
        close()
      }
    }
    new FeatureSetupView(deps).render(modal)
  }
}
