import { Store } from '@geajs/core'
import { panes } from '@views/state/spine'
import shellStore from '@views/state/shell.store'
import { flattenProjects, findProjectByPath } from '@views/catalog/catalog'
import { updatePaneStatus } from '@views/pane/pane'
import type { Pane } from '@views/types/types'

// gea store for the track modal: binds a terminal pane to a project/feature for
// automatic time tracking. Holds only the paneId (NOT the pane object) so the raw
// legacy pane is resolved fresh + mutated directly on save — avoiding a gea proxy
// rejecting the assignment (§5.3). Singleton reset on each open. Self-contained —
// no @ui (§2.7).
class TrackModalStore extends Store {
  paneId = ''
  hasTracking = false
  project = ''
  feature = ''
  private closeFn: () => void = () => {}

  // Seeds from the pane's current binding (read-only) and stores the close handle.
  open(pane: Pane, close: () => void): void {
    this.paneId = pane.id
    this.hasTracking = !!pane.trackProjectPath
    this.project = pane.trackProjectPath ?? ''
    this.feature = pane.trackFeatureId ?? ''
    this.closeFn = close
  }

  get projects() {
    return flattenProjects(shellStore.tree)
  }

  get features() {
    const owner = this.project ? findProjectByPath(shellStore.tree, this.project) : null
    return owner?.features ?? []
  }

  setProject(v: string): void {
    this.project = v
    this.feature = ''
  }

  setFeature(v: string): void {
    this.feature = v
  }

  close(): void {
    this.closeFn()
  }

  // Stop automatic tracking for the pane and close.
  stop(): void {
    const pane = panes.get(this.paneId)
    if (pane) {
      pane.trackProjectPath = null
      pane.trackFeatureId = null
      updatePaneStatus(pane)
    }
    this.close()
  }

  // Bind the pane to the selected project/feature, then close.
  track(): void {
    if (!this.project) return
    const pane = panes.get(this.paneId)
    if (pane) {
      pane.trackProjectPath = this.project
      pane.trackFeatureId = this.feature || null
      updatePaneStatus(pane)
    }
    this.close()
  }
}

export default new TrackModalStore()
