import type { Project } from './types'

// The catalog (Settings → Projects) is a tree: a project can hold sub-projects.
// These pure helpers walk that tree; the live sidebar is a separate structure.

// Depth-first list of every project in the catalog tree (parents before children).
export function flattenProjects(list: Project[]): Project[] {
  const out: Project[] = []
  const visit = (projects: Project[]): void => {
    for (const p of projects) {
      out.push(p)
      if (p.children?.length) visit(p.children)
    }
  }
  visit(list)
  return out
}

// First project whose path matches, searched depth-first (null when none).
export function findProjectByPath(list: Project[], path: string): Project | null {
  for (const p of flattenProjects(list)) {
    if (p.path === path) return p
  }
  return null
}

// Remove a project from anywhere in the tree (by identity). Returns true if removed.
export function removeProject(list: Project[], target: Project): boolean {
  const i = list.indexOf(target)
  if (i >= 0) {
    list.splice(i, 1)
    return true
  }
  for (const p of list) {
    if (p.children && removeProject(p.children, target)) return true
  }
  return false
}
