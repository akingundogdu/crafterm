// Pure sidebar-tree lookup helpers copied into @views (self-contained, §2.7) so
// the iOS worktree add-on does not depend on the legacy @ui tree module. Mirrors
// `findById` + `ancestorFolders` from the legacy tree helpers.

import type { SidebarNode, FolderNode, ProjectNode, WorktreeNode } from '@views/types/types'

export interface Located {
  node: SidebarNode
  parent: SidebarNode[] // sibling list containing the node
  index: number
}

// Folders, projects and worktrees all hold `children`; this narrows to any.
function isContainer(node: SidebarNode): node is FolderNode | ProjectNode | WorktreeNode {
  return node.kind === 'folder' || node.kind === 'project' || node.kind === 'worktree'
}

export function findById(tree: SidebarNode[], id: string): Located | null {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i]
    if (node.id === id) return { node, parent: tree, index: i }
    if (isContainer(node)) {
      const r = findById(node.children, id)
      if (r) return r
    }
  }
  return null
}

// Folder ancestors of a node, outermost first (empty when the node is top-level).
export function ancestorFolders(
  tree: SidebarNode[],
  id: string,
  trail: (FolderNode | WorktreeNode)[] = []
): (FolderNode | WorktreeNode)[] | null {
  for (const node of tree) {
    if (node.id === id) return trail
    if (node.kind === 'folder' || node.kind === 'worktree') {
      const r = ancestorFolders(node.children, id, [...trail, node])
      if (r) return r
    } else if (node.kind === 'project') {
      // descend into projects but don't add them to the folder trail
      const r = ancestorFolders(node.children, id, trail)
      if (r) return r
    }
  }
  return null
}
