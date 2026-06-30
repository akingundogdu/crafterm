import type { ProjectNode, Application } from '@views/types/types'
import { state } from '@views/state/spine'
import { UITexts } from '@texts'
import { flattenProjects } from '@views/catalog/catalog'
import { el } from '@views/lib/dom'
import { overlayModal, makeSearchInput } from '../shared'
import { filterAppProjects, stepSelection } from './project.state'
import { projectRow } from './components/project-row'
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
// Shared: pick a project that has applications, then run `onPick`.
function pickProjectWithApps(title: string, onPick: (p: ProjectNode) => void): void {
  const projects = flattenProjects(state.tree).filter((p) => p.apps?.length)
  const { modal, close } = overlayModal('picker-modal')
  const h = el('h2', null, title)
  if (!projects.length) {
    modal.append(h)
    modal.insertAdjacentHTML(
      'beforeend',
      '<div class="empty-hint">No projects with applications. Add apps in Settings → Projects.</div>'
    )
    return
  }
  const input = makeSearchInput('Filter projects…  (↑↓ move · ⏎ select)', () => render())
  const list = el('div', { class: 'pick-list picker-list' })
  modal.append(h, input, list)
  let sel = 0
  const filtered = (): ProjectNode[] => filterAppProjects(projects, input.value)
  const choose = (p: ProjectNode): void => {
    close()
    onPick(p)
  }
  const highlight = (): void => {
    list.querySelectorAll<HTMLElement>('.project-row').forEach((el, i) => {
      el.classList.toggle('active', i === sel)
    })
  }
  const render = (): void => {
    const items = filtered()
    if (sel >= items.length) sel = Math.max(0, items.length - 1)
    list.replaceChildren()
    items.forEach((p, i) => {
      const n = p.apps?.length ?? 0
      list.appendChild(
        projectRow({
          label: p.name,
          sub: `${p.path} · ${n} app${n === 1 ? '' : 's'}`,
          active: i === sel,
          onClick: () => choose(p),
          onHover: () => {
            sel = i
            highlight()
          }
        })
      )
    })
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    const items = filtered()
    if (e.key === 'Escape') close()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      sel = stepSelection(e.key, sel, items.length)
      highlight()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items[sel]) choose(items[sel])
    }
  })
  render()
  input.focus()
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
