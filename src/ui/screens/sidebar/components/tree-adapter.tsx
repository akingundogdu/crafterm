import type { SidebarNode } from '@ui/types/types'
import type { TreeAdapter, DropPos } from '@ui/components'
import { state, paneActions } from '@ui/state/state'
import { selectTab, toggleCollapse, setNodeColor, setNodeName, moveNode } from '@ui/commands/commands'
import { PROJECT_SVG, FOLDER_SVG, WORKTREE_SVG, tabIssueKey, folderCrumb } from '../sidebar.state'
import { buildLeading, buildTrailing, buildBelow } from './slot-builders'
import { buildCrumb } from './crumb-builder'
import { buildMenu, type MenuContext } from './context-menu-builder'

// Collaborators the adapter needs from the shell that aren't plain commands:
// archived filtering, focusing the list, and the menu's context.
export interface AdapterContext extends MenuContext {
  passesArchiveFilter: (n: SidebarNode) => boolean
  focusList: () => void
}

export function buildAdapter(ctx: AdapterContext): TreeAdapter<SidebarNode> {
  return {
    id: (n) => n.id,
    label: (n) => {
      if (n.kind !== 'tab') return n.name
      const key = tabIssueKey(n)
      return key ? `${n.title} (${key})` : n.title
    },
    icon: (n) => {
      if (n.kind === 'project') return PROJECT_SVG
      if (n.kind === 'worktree') return WORKTREE_SVG
      if (n.kind === 'folder') return n.feature ? WORKTREE_SVG : FOLDER_SVG
      return ''
    },
    iconClass: (n) =>
      n.kind === 'project'
        ? 'project-icon'
        : n.kind === 'worktree' || (n.kind === 'folder' && n.feature)
          ? 'worktree-icon'
          : '',
    leading: buildLeading,
    trailing: buildTrailing,
    below: buildBelow,
    aboveRow: (n) => {
      if (!n.pinned) return null
      const crumb = folderCrumb(n.id)
      return crumb ? buildCrumb(crumb) : null
    },
    rowClass: (n) => {
      if (n.kind === 'worktree' && n.archiving) return 'worktree-archiving'
      return n.kind === 'tab' && n.id === state.activeTabId ? 'active' : ''
    },
    isContainer: (n) => n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree',
    children: (n) =>
      n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree'
        ? n.children.filter(ctx.passesArchiveFilter)
        : [],
    collapsed: (n) => (n.kind === 'tab' ? false : n.collapsed),
    color: (n) => n.color,
    onColor: (n, c) => setNodeColor(n.id, c),
    numbered: false,
    draggable: () => true,
    renamable: () => true,
    onToggle: (n) => toggleCollapse(n.id),
    onActivate: (n) => {
      if (n.kind !== 'tab') return
      // Clicking an archived session reactivates it rather than selecting an empty
      // (dormant) tab.
      if (n.status === 'archived') paneActions.reactivateTab(n.id)
      else selectTab(n.id)
    },
    onClick: (n) => {
      if (n.kind !== 'tab') ctx.focusList()
    },
    onSelect: (n) => {
      if (n) state.selectedNodeId = n.id
    },
    onRename: (n, name) => setNodeName(n.id, name),
    onMove: (dragId, targetId, pos: DropPos) => moveNode(dragId, targetId, pos === 'inside' ? 'into' : pos),
    menu: (n) => buildMenu(n, ctx)
  }
}
