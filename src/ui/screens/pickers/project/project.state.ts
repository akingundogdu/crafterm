import type { ProjectNode } from '@ui/types/types'
import { state } from '@ui/state/state'
import { openProject, newTab, splitProjectRight, splitActivePane } from '@ui/commands/commands'
import { flattenProjects } from '@ui/catalog/catalog'
import type { Entry } from './project.types'

export const sanitizeBranch = (s: string): string => s.trim().replace(/\s+/g, '-')

// `ref` helper: disable native spellcheck on a search input (property form).
export function disableSpellcheck(el: HTMLInputElement): void {
  el.spellcheck = false
}

// Build the project-picker entry list: blank terminal + every saved project +
// a "run apps" entry for each project that defines applications. `openRunApps`
// is injected by the view to avoid a state→view import.
export function buildProjectEntries(
  parentFolderId: string | null,
  openRunApps: (p: ProjectNode) => void
): Entry[] {
  return [
    {
      label: 'Blank terminal',
      openTab: () => void newTab(parentFolderId),
      openSplit: () => void splitActivePane('row')
    },
    ...flattenProjects(state.tree).map((p) => ({
      label: p.name,
      sub: p.command ? `${p.path} · ${p.command}` : p.path,
      // Always nest the new terminal under the picked project's node (not the
      // cmd+O context), so it's grouped with that project in the sidebar.
      openTab: () => void openProject(p),
      openSplit: () => void splitProjectRight(p)
    })),
    ...flattenProjects(state.tree)
      .filter((p) => p.apps?.length)
      .map((p) => ({
        label: `▷ ${p.name} — run apps`,
        sub: `${p.apps?.length} app${p.apps?.length === 1 ? '' : 's'}`,
        openTab: () => openRunApps(p),
        openSplit: () => openRunApps(p)
      }))
  ]
}

// Contains-match across an entry's label + sub.
export function filterEntries(entries: Entry[], query: string): Entry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  return entries.filter((e) => (e.label + ' ' + (e.sub ?? '')).toLowerCase().includes(q))
}

// Contains-match across a project's name + path.
export function filterAppProjects(projects: ProjectNode[], query: string): ProjectNode[] {
  const q = query.trim().toLowerCase()
  return q ? projects.filter((p) => `${p.name} ${p.path}`.toLowerCase().includes(q)) : projects
}

// Pure ↑/↓ selection step, clamped to the list bounds.
export function stepSelection(key: string, sel: number, len: number): number {
  if (key === 'ArrowDown') return Math.min(len - 1, sel + 1)
  if (key === 'ArrowUp') return Math.max(0, sel - 1)
  return sel
}

// Choose handler: ⌘/ctrl (or split mode) splits the active pane; otherwise opens
// a new tab. Either way the picker closes.
export function makeChoose(close: () => void, splitMode: boolean): (e: Entry, split: boolean) => void {
  return (e, split) => {
    if (split || splitMode) e.openSplit()
    else e.openTab()
    close()
  }
}

// "Split" button handler for a run target: drops it into a split beside the
// active pane, then closes.
export function makeRunSplit(
  target: Parameters<typeof splitProjectRight>[0],
  close: () => void
): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    void splitProjectRight(target)
    close()
  }
}

// "New tab" button handler for a run target: opens it as its own terminal under
// the project, then closes.
export function makeRunTab(
  target: Parameters<typeof openProject>[0],
  projectId: string,
  close: () => void
): (e: Event) => void {
  return (e) => {
    e.stopPropagation()
    void openProject(target, projectId)
    close()
  }
}
