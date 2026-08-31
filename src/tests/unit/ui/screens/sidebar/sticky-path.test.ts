import { describe, it, expect } from 'vitest'
import type { FolderNode, ProjectNode, SidebarNode, TabNode, WorktreeNode } from '@views/types/types'
import { crumbsFor, crumbSignature, pickTopRowIndex } from '@views/screens/sidebar/components/sticky-path.store'

function tab(id: string): TabNode {
  return {
    kind: 'tab',
    id,
    title: id,
    color: null,
    pinned: false,
    root: { type: 'leaf', paneId: 'p-' + id }
  } as TabNode
}

function folder(id: string, name: string, children: SidebarNode[], color: string | null = null): FolderNode {
  return { kind: 'folder', id, name, color, collapsed: false, pinned: false, children } as FolderNode
}

function worktree(id: string, name: string, children: SidebarNode[]): WorktreeNode {
  return {
    kind: 'worktree',
    id,
    name,
    color: null,
    collapsed: false,
    pinned: false,
    children,
    branch: name,
    worktreePath: '/tmp/' + name
  } as WorktreeNode
}

function project(id: string, name: string, children: SidebarNode[]): ProjectNode {
  return {
    kind: 'project',
    id,
    name,
    path: '/tmp/' + name,
    color: null,
    collapsed: false,
    pinned: false,
    children
  } as ProjectNode
}

// Musicpal › backend › worktrees › MSP-BE-89 › (session)
const session = tab('t1')
const tree: SidebarNode[] = [
  folder('company', 'Musicpal', [
    project('backend', 'backend', [
      folder('wt-folder', 'worktrees', [worktree('wt', 'MSP-BE-89-course-tts-streaming', [session])])
    ]),
    project('mobile', 'mobile', [], )
  ]),
  tab('free')
]

describe('crumbsFor', () => {
  it('names every container ancestor, outermost first', () => {
    expect(crumbsFor(tree, 't1')).toEqual(['Musicpal', 'backend', 'worktrees', 'MSP-BE-89-course-tts-streaming'])
  })

  it('stops at the ancestors — the row itself is never a crumb', () => {
    expect(crumbsFor(tree, 'wt-folder')).toEqual(['Musicpal', 'backend'])
  })

  it('is empty for a top-level row', () => {
    expect(crumbsFor(tree, 'free')).toEqual([])
    expect(crumbsFor(tree, 'company')).toEqual([])
  })

  it('is empty for an unknown id (a non-terminal mode renders its own rows)', () => {
    expect(crumbsFor(tree, '/Users/me/notes/note.md')).toEqual([])
    expect(crumbsFor(tree, null)).toEqual([])
  })

  it('names a colour-tagged container by its plain name', () => {
    const colored: SidebarNode[] = [folder('c', 'Coloured', [tab('t2')], '#ff0000')]
    expect(crumbsFor(colored, 't2')).toEqual(['Coloured'])
  })
})

describe('pickTopRowIndex', () => {
  // ten 20px rows starting at y=0, i.e. row i spans [20i, 20i+20)
  const bottoms = (i: number): number => 20 * i + 20

  it('picks the first row whose bottom edge is below the sticky bar', () => {
    expect(pickTopRowIndex(10, bottoms, 0)).toBe(0)
    expect(pickTopRowIndex(10, bottoms, 25)).toBe(1)
    expect(pickTopRowIndex(10, bottoms, 100)).toBe(5)
  })

  it('treats a row whose bottom exactly touches the edge as scrolled past', () => {
    expect(pickTopRowIndex(10, bottoms, 20)).toBe(1)
  })

  it('returns -1 when every row is above the edge', () => {
    expect(pickTopRowIndex(10, bottoms, 400)).toBe(-1)
    expect(pickTopRowIndex(0, bottoms, 0)).toBe(-1)
  })

  it('measures only a logarithmic number of rows', () => {
    let reads = 0
    const counted = (i: number): number => {
      reads++
      return bottoms(i)
    }
    pickTopRowIndex(1000, counted, 4321)
    expect(reads).toBeLessThan(12)
  })
})

describe('crumbSignature', () => {
  it('is stable for the same path and differs for another', () => {
    const a = crumbsFor(tree, 't1')
    expect(crumbSignature(a)).toBe(crumbSignature(crumbsFor(tree, 't1')))
    expect(crumbSignature(a)).not.toBe(crumbSignature(crumbsFor(tree, 'wt-folder')))
    expect(crumbSignature([])).not.toBe(crumbSignature(['Musicpal']))
  })
})
