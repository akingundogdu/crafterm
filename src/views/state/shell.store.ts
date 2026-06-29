import { Store } from '@geajs/core'
import type { SidebarNode } from '@views/types/types'
import { state } from '@ui/state/state'

// Phase 1 shell mirror-store. The legacy `state` singleton in @ui/state/state
// stays the single source of truth — un-migrated src/ui code keeps reading and
// mutating it directly. This store mirrors its shell fields into reactive
// properties so the future gea sidebar/content (Phase 9) can read them and gea
// will patch the DOM automatically, replacing the manual requestSidebar() /
// hooks.renderSidebar() orchestration.
//
// reload() is invoked from the existing render-orchestration chokepoints in
// state.ts (requestSidebar / requestStatuses / renderContent / updateActive /
// updatePaneActive) — the single funnel every legacy render request already
// passes through — so the snapshot never lags the UI without touching the ~130
// legacy read sites. The tree is re-wrapped in a fresh array on every reload
// (sharing the node objects, not duplicating them) so an in-place mutation of
// `state.tree` still registers as a change for gea. Until a gea consumer exists
// this store is write-only; behavior is unchanged (parity).
class ShellStore extends Store {
  tree: SidebarNode[] = []
  activePaneId: string | null = null
  activeTabId: string | null = null
  selectedNodeId: string | null = null

  reload(): void {
    this.tree = [...state.tree]
    this.activePaneId = state.activePaneId
    this.activeTabId = state.activeTabId
    this.selectedNodeId = state.selectedNodeId
  }
}

export default new ShellStore()
