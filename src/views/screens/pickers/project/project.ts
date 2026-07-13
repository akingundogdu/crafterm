import type { ProjectNode, Application } from '@views/types/types'
import { state, settings } from '@views/state/spine'
import { UITexts } from '@texts'
import { flattenProjects } from '@views/catalog/catalog'
import { runApplications, createFeature, resolveAppPath } from '@views/commands/commands'
import { overlayModal } from '../shared'
import { buildProjectEntries, stepSelection, makeChoose, makeRunSplit, makeRunTab } from './project.store'
import projectStore, { type ProjectPickRow } from './project.store'
import runAppsStore from './run-apps.store'
import featureStore from './feature-setup.store'
import ProjectPickerView, { type ProjectPickerDeps } from './components/project-picker-view'
import RunAppsView, { type RunAppsDeps } from './components/run-apps-view'
import RunCommandView, { type RunCommandRowData } from './components/run-command-view'
import RunAppView, { type RunAppRowData } from './components/run-app-view'
import FeatureSetupView, { type FeatureSetupDeps } from './components/feature-setup-view'

// ---- Project picker: open a saved project (or a blank terminal) ----

// Opens the project-picker overlay: builds the entry rows, seeds the reactive
// project.store, mounts the gea picker view and drives keyboard navigation via the
// store's selection index. The reactive DOM (search + filtered list) lives in
// ProjectPickerView / ProjectList reading project.store; this entry owns only the
// row construction + keynav (no separate controller).
export function showProjectPicker(parentFolderId: string | null, opts?: { split?: boolean }): void {
  const splitMode = !!opts?.split
  const { modal, close } = overlayModal('picker-modal')

  const entries = buildProjectEntries(parentFolderId, (p) => showRunApps(p))
  const choose = makeChoose(close, splitMode)
  const rows: ProjectPickRow[] = entries.map((e) => ({
    label: e.label,
    sub: e.sub,
    filterText: e.label + ' ' + (e.sub ?? ''),
    onChoose: (split: boolean) => choose(e, split)
  }))
  projectStore.set(rows)

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = projectStore.visible()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      projectStore.setSel(stepSelection(e.key, projectStore.sel, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = items[projectStore.sel]
      if (row) row.onChoose(e.metaKey || e.ctrlKey)
    }
  }

  const deps: ProjectPickerDeps = {
    title: splitMode ? UITexts.Pickers.project.split : UITexts.Pickers.project.open,
    placeholder: splitMode
      ? UITexts.Pickers.project.splitPlaceholder
      : UITexts.Pickers.project.openPlaceholder,
    onHover: (i) => projectStore.setSel(i),
    onKeyDown: onKey
  }
  new ProjectPickerView(deps).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

// ---- Run applications: pick environment + apps, open a tiled tab ----

// Modal for one project: choose an environment, tick apps, run them together.
// Seeds the reactive run-apps.store and mounts the gea view; the reactive DOM
// (env chips + checkbox list) reads run-apps.store.
export function showRunApps(project: ProjectNode): void {
  const apps = project.apps ?? []
  const env = settings.environments[0]
  const { modal, close } = overlayModal('picker-modal')
  const empty = !apps.length || !settings.environments.length
  const emptyText = empty
    ? `${apps.length ? UITexts.Pickers.project.noEnvironments : UITexts.Pickers.project.noApplications} Add them in Settings → Projects.`
    : null
  if (!empty) runAppsStore.reset(apps, env)

  const deps: RunAppsDeps = {
    title: `Run — ${project.name}`,
    emptyText,
    environments: settings.environments,
    close,
    onRun: () => {
      const selected = runAppsStore.selected()
      if (selected.length) void runApplications(project, runAppsStore.env, selected)
      close()
    }
  }
  new RunAppsView(deps).render(modal)
}

// Pick a project that has applications, then open its run modal.
// Shared: pick a project that has applications, then run `onPick`. Mounts the gea
// project-list view over project.store; the reactive search + list live there, this
// owns the row construction + keyboard navigation.
function pickProjectWithApps(title: string, onPick: (p: ProjectNode) => void): void {
  const projects = flattenProjects(state.tree).filter((p) => p.apps?.length)
  const { modal, close } = overlayModal('picker-modal')

  const rows: ProjectPickRow[] = projects.map((p) => {
    const n = p.apps?.length ?? 0
    return {
      label: p.name,
      sub: `${p.path} · ${n} app${n === 1 ? '' : 's'}`,
      filterText: `${p.name} ${p.path}`,
      onChoose: () => {
        close()
        onPick(p)
      }
    }
  })
  projectStore.set(rows)

  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    const items = projectStore.visible()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      projectStore.setSel(stepSelection(e.key, projectStore.sel, items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = items[projectStore.sel]
      if (row) row.onChoose(false)
    }
  }

  const deps: ProjectPickerDeps = {
    title,
    placeholder: 'Filter projects…  (↑↓ move · ⏎ select)',
    emptyHint: 'No projects with applications. Add apps in Settings → Projects.',
    onHover: (i) => projectStore.setSel(i),
    onKeyDown: onKey
  }
  new ProjectPickerView(deps).render(modal)
  ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
}

export function showRunAppsPicker(): void {
  pickProjectWithApps(UITexts.Pickers.project.runApplications, showRunApps)
}

export function showFeaturePicker(): void {
  pickProjectWithApps(UITexts.Pickers.project.newFeature, showFeatureSetup)
}

// Project-specific named commands: a list with two run options per row —
// "Split" (drop into a split beside the active pane) and "New tab" (open as
// its own terminal under the project). Both spawn at the project's path.
export function showRunCommand(project: ProjectNode): void {
  const cmds = project.runCommands ?? []
  const { modal, close } = overlayModal('picker-modal')
  const rows: RunCommandRowData[] = cmds.map((rc) => {
    const target = {
      name: rc.name,
      path: project.path,
      command: rc.command,
      env: project.env,
      shell: project.shell
    }
    return {
      name: rc.name,
      command: rc.command,
      onSplit: makeRunSplit(target, close),
      onTab: makeRunTab(target, project.id, close)
    }
  })
  new RunCommandView({
    title: `Run command — ${project.name}`,
    emptyText: 'No run commands. Add them in Settings → Projects.',
    rows
  }).render(modal)
}

// Launch a single application (from the pane ⋯ menu). Lists each environment the
// app has a command for; Split runs it beside the active pane, New tab opens it in
// a fresh tab under the project. The project's startup is chained before the dev
// command, matching runApplications().
export function showRunApp(project: ProjectNode, app: Application): void {
  const envs = settings.environments.filter((e) => (app.commands?.[e] ?? '').trim())
  const { modal, close } = overlayModal('picker-modal')
  const appPath = resolveAppPath(project.path, app.path)
  const startup = project.startup?.trim()
  const rows: RunAppRowData[] = envs.map((env) => {
    const dev = (app.commands[env] ?? '').trim()
    const command = startup ? `${startup} && ${dev}` : dev
    const target = {
      name: `${app.name} · ${env}`,
      path: appPath,
      command,
      env: project.env,
      shell: project.shell
    }
    return {
      env,
      command: dev,
      onSplit: makeRunSplit(target, close),
      onTab: makeRunTab(target, project.id, close)
    }
  })
  new RunAppView({
    title: `Run ${app.name} — ${project.name}`,
    emptyText: 'No commands configured for this application. Add them in Settings → Projects.',
    rows
  }).render(modal)
}

// ---- Feature setup: feature name + branch + env + apps (+ per-app worktree) ----

// Feature setup: feature name + branch + env + apps (+ per-app worktree). Seeds the
// reactive feature-setup.store and mounts the gea view; the reactive app-section
// reads feature-setup.store while the text inputs live uncontrolled in the shell.
export function showFeatureSetup(project: ProjectNode): void {
  const apps = project.apps ?? []
  const hasApps = apps.length > 0 && settings.environments.length > 0
  const env = settings.environments[0] ?? ''
  const { modal, close } = overlayModal('picker-modal')
  featureStore.reset(hasApps ? apps : [], env)

  const emptyText = `${
    apps.length
      ? UITexts.Pickers.project.noEnvironmentsConfigured
      : UITexts.Pickers.project.noApplicationsDefined
  } The feature folder will be created without any auto-spawned terminals. Define apps in Settings → Projects to launch them automatically.`

  const deps: FeatureSetupDeps = {
    title: `New feature — ${project.name}`,
    hasApps,
    emptyText,
    environments: settings.environments,
    close,
    onCreate: ({ branch, base, chosen }) => {
      void createFeature(project, { branch, base, env: featureStore.env, apps: chosen })
      close()
    }
  }
  new FeatureSetupView(deps).render(modal)
}
