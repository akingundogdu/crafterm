import { createSelect } from '@ui/components'
import { state } from '@ui/state/state'
import { findProjectByPath } from '@ui/catalog/catalog'
import { UITexts } from '@texts'
import type { Pane } from '@ui/types/types'

// The feature list depends on the selected project, so this is rebuilt + swapped
// whenever the project changes (createSelect is otherwise static).
export function createTrackFeatureSelect(pane: Pane, projectPath: string): HTMLSelectElement {
  const owner = projectPath ? findProjectByPath(state.tree, projectPath) : null
  const s = createSelect({
    options: (owner?.features ?? []).map((f) => ({ value: f.id, label: f.name })),
    emptyLabel: UITexts.Time.noFeature,
    value: pane.trackFeatureId ?? ''
  })
  s.className = 'settings-select'
  s.style.width = '100%'
  return s
}
