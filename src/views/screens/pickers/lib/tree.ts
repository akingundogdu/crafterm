import type { LayoutNode, SidebarNode, TabNode, FolderNode, WorktreeNode } from '@views/types/types'

// Pure tree-walk helpers copied locally for the pickers (the @ui/tree module has
// no @views home yet). Self-contained (§2.7) — kept byte-faithful to @ui/tree.

// Every paneId in a pane layout subtree.
export function panesInLayout(node: LayoutNode, acc: string[] = []): string[] {
  if (node.type === 'leaf') acc.push(node.paneId)
  else node.children.forEach((c) => panesInLayout(c, acc))
  return acc
}

// Every TabNode in the sidebar tree (depth-first).
export function allTabs(tree: SidebarNode[], acc: TabNode[] = []): TabNode[] {
  for (const node of tree) {
    if (node.kind === 'tab') acc.push(node)
    else allTabs(node.children, acc)
  }
  return acc
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
