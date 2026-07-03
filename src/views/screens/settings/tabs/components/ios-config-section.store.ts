import { Store } from '@geajs/core'
import { state } from '@views/state/spine'
import { findProjectById } from '@views/catalog/catalog'

// Reactive state for the per-project iOS section. `enabled` mirrors ProjectNode.iosApp
// (the toggle that reveals the config + worktree manager) and `copyFiles` mirrors the
// iOS config's copy-into-new-worktrees list — both read in IosBody.template so gea
// re-renders on toggle / add / remove (the ssh/action-menu pattern; a bare `void rev`
// read is NOT tracked). Keyed by projectId so handlers resolve the RAW project node
// from the tree (never a proxied prop object — §gea 5.3) before mutating + persisting.
class IosStore extends Store {
  projectId = ''
  enabled = false
  copyFiles: string[] = []

  reload(projectId: string): void {
    this.projectId = projectId
    const p = findProjectById(state.tree, projectId)
    this.enabled = !!p?.iosApp
    this.copyFiles = [...(p?.iosConfig?.copyFiles ?? [])]
  }
}

export default new IosStore()
