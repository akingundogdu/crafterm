import { Store } from '@geajs/core'
import { state } from '@views/state/spine'
import { findProjectById } from '@views/catalog/catalog'
import type { Feature } from '@views/types/types'

// Reactive state for the project Features section. `features` mirrors the project's
// feature list (read in FeaturesBody.template so gea re-renders on add / remove /
// rename — the ssh/action-menu pattern; a bare `void rev` read is NOT tracked).
// Keyed by projectId so handlers resolve the RAW project node from the tree (never a
// proxied prop object — §gea 5.3) before mutating + persisting.
class FeaturesStore extends Store {
  projectId = ''
  features: Feature[] = []

  reload(projectId: string): void {
    this.projectId = projectId
    const p = findProjectById(state.tree, projectId)
    this.features = [...(p?.features ?? [])]
  }
}

export default new FeaturesStore()
