import { state } from '@views/state/spine'
import type { ProjectNode } from '@views/types/types'

// One flattened catalog-tree row for the Projects editor's left column: the display
// strings + selection/indent state the gea ProjectTreeRow renders, keyed by id.
export interface ProjectTreeRowData {
  id: string
  name: string
  group: string
  appsLabel: string
  active: boolean
  paddingLeft: string
}

// Flatten the project sub-tree (top-level projects + nested sub-projects) into indent-
// aware rows, mirroring the legacy recursive renderRows: 8px base + 14px per depth,
// the "N app(s)" badge, and the active row keyed by the selected project's id.
export function flattenTreeRows(selectedId: string | null): ProjectTreeRowData[] {
  const rows: ProjectTreeRowData[] = []
  const walk = (projects: ProjectNode[], depth: number): void => {
    for (const p of projects) {
      rows.push({
        id: p.id,
        name: p.name || '(untitled)',
        group: p.group ?? '',
        appsLabel: p.apps?.length ? (p.apps.length === 1 ? '1 app' : `${p.apps.length} apps`) : '',
        active: p.id === selectedId,
        paddingLeft: 8 + depth * 14 + 'px'
      })
      const subProjects = p.children.filter((c): c is ProjectNode => c.kind === 'project')
      if (subProjects.length) walk(subProjects, depth + 1)
    }
  }
  walk(
    state.tree.filter((n): n is ProjectNode => n.kind === 'project'),
    0
  )
  return rows
}
