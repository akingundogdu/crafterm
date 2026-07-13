import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode, SidebarNode } from '@views/types/types'

const tree: SidebarNode[] = []

vi.mock('@views/state/spine', () => ({ state: { tree } }))

const { projectOptions, projectPath } = await import('@views/components/project-select/project-select.store')

function project(id: string, name: string, extra: Partial<ProjectNode> = {}): ProjectNode {
  return {
    kind: 'project',
    id,
    name,
    path: `/repos/${name}`,
    children: [],
    ...extra
  } as unknown as ProjectNode
}

describe('projectOptions', () => {
  beforeEach(() => {
    tree.length = 0
  })

  it('labels a project with its issue key prefix', () => {
    tree.push(project('p1', 'crafterm', { issueKeyPrefix: 'CRF' }), project('p2', 'plain'))

    expect(projectOptions().map((o) => o.label)).toEqual(['crafterm (CRF)', 'plain'])
  })

  it('indents sub-projects under their parent', () => {
    tree.push(project('p1', 'root', { children: [project('p2', 'child')] as unknown as SidebarNode[] }))

    expect(projectOptions().map((o) => o.label)).toEqual(['root', '   └ child'])
  })

  it('prepends the empty option only when a label is given', () => {
    tree.push(project('p1', 'crafterm'))

    expect(projectOptions('All projects').map((o) => o.id)).toEqual(['', 'p1'])
    expect(projectOptions().map((o) => o.id)).toEqual(['p1'])
  })

  it('carries each project path for the hint', () => {
    tree.push(project('p1', 'crafterm'))
    const options = projectOptions('All projects')

    expect(projectPath(options, 'p1')).toBe('/repos/crafterm')
    expect(projectPath(options, '')).toBe('')
    expect(projectPath(options, 'missing')).toBe('')
  })
})
