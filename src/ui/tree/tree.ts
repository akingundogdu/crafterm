import type { Dir, LayoutNode, SidebarNode, TabNode, FolderNode, ProjectNode, WorktreeNode } from '@ui/types/types'

// Folders, projects and worktrees all hold `children`; this narrows to any.
export function isContainer(node: SidebarNode): node is FolderNode | ProjectNode | WorktreeNode {
  return node.kind === 'folder' || node.kind === 'project' || node.kind === 'worktree'
}

// ===========================================================================
// Pane layout split-tree helpers (per terminal session)
// ===========================================================================

export function firstPaneOf(node?: LayoutNode | null): string | null {
  if (!node) return null
  if (node.type === 'leaf') return node.paneId
  for (const c of node.children) {
    const r = firstPaneOf(c)
    if (r) return r
  }
  return null
}

export function panesInLayout(node: LayoutNode, acc: string[] = []): string[] {
  if (node.type === 'leaf') acc.push(node.paneId)
  else node.children.forEach((c) => panesInLayout(c, acc))
  return acc
}

export function layoutContains(node: LayoutNode, paneId: string): boolean {
  if (node.type === 'leaf') return node.paneId === paneId
  return node.children.some((c) => layoutContains(c, paneId))
}

export function splitInLayout(
  node: LayoutNode,
  targetPaneId: string,
  newPaneId: string,
  dir: Dir
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.paneId !== targetPaneId) return node
    return {
      type: 'split',
      dir,
      sizes: [0.5, 0.5],
      children: [
        { type: 'leaf', paneId: targetPaneId },
        { type: 'leaf', paneId: newPaneId }
      ]
    }
  }
  return { ...node, children: node.children.map((c) => splitInLayout(c, targetPaneId, newPaneId, dir)) }
}

// Move `dragId` next to `targetId` (drag-to-rearrange). `before` puts it on the
// left/top, otherwise right/bottom; `dir` is the split orientation.
export function movePaneInLayout(
  root: LayoutNode,
  dragId: string,
  targetId: string,
  dir: Dir,
  before: boolean
): LayoutNode | null {
  if (dragId === targetId) return root
  const pruned = removePaneFromLayout(root, dragId)
  if (!pruned) return null
  return insertBeside(pruned, targetId, dragId, dir, before)
}

function insertBeside(
  node: LayoutNode,
  targetId: string,
  leafId: string,
  dir: Dir,
  before: boolean
): LayoutNode {
  if (node.type === 'leaf') {
    if (node.paneId !== targetId) return node
    const dragged: LayoutNode = { type: 'leaf', paneId: leafId }
    return {
      type: 'split',
      dir,
      sizes: [0.5, 0.5],
      children: before ? [dragged, node] : [node, dragged]
    }
  }
  return { ...node, children: node.children.map((c) => insertBeside(c, targetId, leafId, dir, before)) }
}

export function removePaneFromLayout(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.type === 'leaf') return node.paneId === paneId ? null : node
  const kids = node.children
    .map((c) => removePaneFromLayout(c, paneId))
    .filter((c): c is LayoutNode => c !== null)
  if (kids.length === 0) return null
  if (kids.length === 1) return kids[0]
  return { ...node, children: kids }
}

// ===========================================================================
// Sidebar tree helpers (folders + tabs)
// ===========================================================================

export interface Located {
  node: SidebarNode
  parent: SidebarNode[] // sibling list containing the node
  index: number
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

export function findTab(tree: SidebarNode[], tabId: string): TabNode | null {
  const r = findById(tree, tabId)
  return r && r.node.kind === 'tab' ? r.node : null
}

export function allTabs(tree: SidebarNode[], acc: TabNode[] = []): TabNode[] {
  for (const node of tree) {
    if (node.kind === 'tab') acc.push(node)
    else allTabs(node.children, acc)
  }
  return acc
}

// The tab whose layout contains the given pane.
export function findTabByPane(tree: SidebarNode[], paneId: string): TabNode | null {
  return allTabs(tree).find((t) => layoutContains(t.root, paneId)) ?? null
}

export function isDescendant(parent: SidebarNode, maybeChildId: string): boolean {
  if (!isContainer(parent)) return false
  return parent.children.some(
    (c) => c.id === maybeChildId || isDescendant(c, maybeChildId)
  )
}

// Folder nesting depth of a node id within the tree (top-level folder = 1).
export function depthOfFolder(tree: SidebarNode[], folderId: string, depth = 1): number {
  for (const node of tree) {
    if (node.kind !== 'folder') continue
    if (node.id === folderId) return depth
    const r = depthOfFolder(node.children, folderId, depth + 1)
    if (r) return r
  }
  return 0
}

// How many folder levels a subtree spans (a tab/empty folder = 0/1).
export function subtreeFolderDepth(node: SidebarNode): number {
  if (node.kind === 'tab') return 0
  const childDepths = node.children.map((c) =>
    c.kind === 'folder' || c.kind === 'worktree' ? subtreeFolderDepth(c) : 0
  )
  return 1 + (childDepths.length ? Math.max(...childDepths) : 0)
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

// Pinned roots = pinned nodes with no pinned ancestor (rendered in the Pinned section).
export function collectPinnedRoots(tree: SidebarNode[], acc: SidebarNode[] = []): SidebarNode[] {
  for (const node of tree) {
    if (node.pinned) acc.push(node)
    else if (isContainer(node)) collectPinnedRoots(node.children, acc)
  }
  return acc
}

export function makeFolder(id: string, name: string): FolderNode {
  return { kind: 'folder', id, name, color: null, collapsed: false, pinned: false, children: [] }
}

export function makeProject(id: string, name: string, path: string): ProjectNode {
  return {
    kind: 'project',
    id,
    name,
    path,
    color: null,
    collapsed: false,
    pinned: false,
    children: []
  }
}

// The nearest enclosing project of a node id (for cmd+T auto-select).
// Returns null when the node exists but is in no project; null when not found too.
export function projectOf(tree: SidebarNode[], id: string): ProjectNode | null {
  const walk = (nodes: SidebarNode[], proj: ProjectNode | null): ProjectNode | null | false => {
    for (const node of nodes) {
      const here = node.kind === 'project' ? node : proj
      if (node.id === id) return here
      if (isContainer(node)) {
        const r = walk(node.children, here)
        if (r !== false) return r
      }
    }
    return false
  }
  const r = walk(tree, null)
  return r === false ? null : r
}
