import type { ProjectNode, Application } from '@views/types/types'
import { state } from '@views/state/spine'
import { UITexts } from '@texts'
import { flattenProjects } from '@views/catalog/catalog'
import { overlayModal } from '../shared'
import { stepSelection } from './project.state'
import projectStore, { type ProjectPickRow } from './project.store'
import ProjectPickerView, { type ProjectPickerDeps } from './components/project-picker-view'
import {
  ProjectPickerController,
  RunAppsController,
  RunCommandController,
  RunAppController,
  FeatureSetupController
} from './project.controller'

// ---- Project picker: open a saved project (or a blank terminal) ----

export function showProjectPicker(parentFolderId: string | null, opts?: { split?: boolean }): void {
  new ProjectPickerController(parentFolderId, opts).open()
}

// ---- Run applications: pick environment + apps, open a tiled tab ----

// Modal for one project: choose an environment, tick apps, run them together.
export function showRunApps(project: ProjectNode): void {
  new RunAppsController(project).open()
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
  new RunCommandController(project).open()
}

// Launch a single application (from the pane ⋯ menu). Lists each environment the
// app has a command for; Split runs it beside the active pane, New tab opens it in
// a fresh tab under the project. The project's startup is chained before the dev
// command, matching runApplications().
export function showRunApp(project: ProjectNode, app: Application): void {
  new RunAppController(project, app).open()
}

// ---- Feature setup: feature name + branch + env + apps (+ per-app worktree) ----

export function showFeatureSetup(project: ProjectNode): void {
  new FeatureSetupController(project).open()
}
