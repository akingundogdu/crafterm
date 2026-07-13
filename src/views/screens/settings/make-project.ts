import type { ProjectNode } from '@views/types/types'

// Settings-local copy of the tree helper's makeProject factory (§2.7
// self-contained; the projects tab is its only consumer here). Builds a fresh,
// empty top-level project node.
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
