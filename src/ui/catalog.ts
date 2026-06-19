import type { SidebarNode, ProjectNode, Feature, Application } from './types'

// Tree-walk helpers over the unified sidebar tree. The sidebar is the only
// source of truth: projects, sub-projects, their apps and time-tracking
// features all live as ProjectNode entries inside state.tree.

// Depth-first list of every ProjectNode in the tree (parents before children).
export function flattenProjects(nodes: SidebarNode[]): ProjectNode[] {
  const out: ProjectNode[] = []
  const visit = (list: SidebarNode[]): void => {
    for (const n of list) {
      if (n.kind === 'project') {
        out.push(n)
        visit(n.children)
      } else if (n.kind === 'folder') {
        visit(n.children)
      }
    }
  }
  visit(nodes)
  return out
}

// First ProjectNode whose path matches (depth-first), or null.
export function findProjectByPath(nodes: SidebarNode[], path: string): ProjectNode | null {
  for (const p of flattenProjects(nodes)) {
    if (p.path === path) return p
  }
  return null
}

// First ProjectNode whose id matches, or null.
export function findProjectById(nodes: SidebarNode[], id: string): ProjectNode | null {
  for (const p of flattenProjects(nodes)) {
    if (p.id === id) return p
  }
  return null
}

// Find an Application by id across all projects. Returns the owning project too.
export function findApp(
  nodes: SidebarNode[],
  appId: string
): { project: ProjectNode; app: Application } | null {
  for (const p of flattenProjects(nodes)) {
    const app = p.apps?.find((a) => a.id === appId)
    if (app) return { project: p, app }
  }
  return null
}

// Find a Feature by id across all projects. Returns the owning project too.
export function findFeature(
  nodes: SidebarNode[],
  featureId: string
): { project: ProjectNode; feature: Feature } | null {
  for (const p of flattenProjects(nodes)) {
    const feature = p.features?.find((f) => f.id === featureId)
    if (feature) return { project: p, feature }
  }
  return null
}

// Remove a ProjectNode from anywhere in the tree (by identity). Returns true if removed.
export function removeProject(nodes: SidebarNode[], target: ProjectNode): boolean {
  const i = nodes.indexOf(target)
  if (i >= 0) {
    nodes.splice(i, 1)
    return true
  }
  for (const n of nodes) {
    if ((n.kind === 'project' || n.kind === 'folder') && removeProject(n.children, target)) {
      return true
    }
  }
  return false
}
