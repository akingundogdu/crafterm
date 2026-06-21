import { createSelect } from '@ui/components'
import { state } from '@ui/state/state'
import { flattenProjects } from '@ui/catalog/catalog'
import type { Pane } from '@ui/types/types'

// The project <select> for the track modal, seeded with the pane's current binding.
export function createTrackProjectSelect(pane: Pane): HTMLSelectElement {
  const projects = flattenProjects(state.tree)
  const proj = projects.length
    ? createSelect({
        options: projects.map((p) => ({ value: p.path, label: p.name })),
        value: pane.trackProjectPath ?? undefined
      })
    : createSelect({ options: [], emptyLabel: '(no projects)' })
  proj.className = 'settings-select'
  proj.style.width = '100%'
  return proj
}
