import { describe, it, expect } from 'vitest'
import {
  firstPaneOf, panesInLayout, layoutContains, splitInLayout, movePaneInLayout, removePaneFromLayout,
  isContainer, findById, findTab, allTabs, findTabByPane, isDescendant, depthOfFolder, projectOf,
  collectPinnedRoots, makeFolder, makeProject
} from '@ui/tree/tree'
import type { LayoutNode, Dir, TabNode, SidebarNode } from '@ui/types/types'

const leaf = (paneId: string): LayoutNode => ({ type: 'leaf', paneId })
const split = (dir: Dir, ...children: LayoutNode[]): LayoutNode => ({ type: 'split', dir, sizes: children.map(() => 1 / children.length), children })
const tab = (id: string, root: LayoutNode, pinned = false): TabNode => ({ kind: 'tab', id, title: id, titleLocked: false, color: null, pinned, root })

describe('LayoutNode helpers', () => {
  it('firstPaneOf returns the first leaf in DFS order', () => {
    expect(firstPaneOf(null)).toBeNull()
    expect(firstPaneOf(leaf('p1'))).toBe('p1')
    expect(firstPaneOf(split('row', leaf('a'), leaf('b')))).toBe('a')
    expect(firstPaneOf(split('row', split('col', leaf('a'), leaf('b')), leaf('c')))).toBe('a')
  })

  it('panesInLayout collects every leaf id', () => {
    expect(panesInLayout(leaf('p1'))).toEqual(['p1'])
    expect(panesInLayout(split('row', leaf('a'), split('col', leaf('b'), leaf('c'))))).toEqual(['a', 'b', 'c'])
  })

  it('layoutContains finds a paneId', () => {
    expect(layoutContains(leaf('a'), 'a')).toBe(true)
    expect(layoutContains(leaf('a'), 'b')).toBe(false)
    expect(layoutContains(split('row', leaf('a'), leaf('b')), 'b')).toBe(true)
  })

  it('splitInLayout splits a leaf into a 2-child split, immutably', () => {
    const input = leaf('a')
    expect(splitInLayout(input, 'a', 'b', 'row')).toEqual({
      type: 'split', dir: 'row', sizes: [0.5, 0.5], children: [{ type: 'leaf', paneId: 'a' }, { type: 'leaf', paneId: 'b' }]
    })
    expect(input.type).toBe('leaf') // not mutated
    expect(splitInLayout(input, 'x', 'b', 'row')).toBe(input) // no-match → same ref
  })

  it('removePaneFromLayout collapses to a lone child + nulls when empty', () => {
    expect(removePaneFromLayout(leaf('a'), 'a')).toBeNull()
    expect(removePaneFromLayout(split('row', leaf('a'), leaf('b')), 'a')).toEqual(leaf('b'))
    const three = removePaneFromLayout(split('row', leaf('a'), leaf('b'), leaf('c')), 'b') as LayoutNode
    expect(three.type).toBe('split')
    expect(panesInLayout(three)).toEqual(['a', 'c'])
  })

  it('movePaneInLayout reorders, short-circuits same-id, nulls a sole leaf', () => {
    const L = split('row', leaf('a'), leaf('b'))
    expect(movePaneInLayout(L, 'a', 'a', 'row', true)).toBe(L) // same id
    expect(movePaneInLayout(leaf('a'), 'a', 'x', 'row', true)).toBeNull() // sole leaf
    const moved = movePaneInLayout(L, 'a', 'b', 'row', false) as LayoutNode
    expect(panesInLayout(moved)).toEqual(['b', 'a'])
  })
})

describe('SidebarNode helpers', () => {
  it('isContainer distinguishes containers from tabs', () => {
    expect(isContainer(tab('t', leaf('p')))).toBe(false)
    expect(isContainer(makeFolder('f', 'F'))).toBe(true)
  })

  it('findById / findTab / allTabs walk the tree', () => {
    const f = makeFolder('f', 'F')
    f.children.push(tab('t1', leaf('p1')))
    const tree: SidebarNode[] = [tab('t0', leaf('p0')), f]
    const loc = findById(tree, 't1')
    expect(loc?.node.id).toBe('t1')
    expect(loc?.parent).toBe(f.children)
    expect(loc?.index).toBe(0)
    expect(findById(tree, 'nope')).toBeNull()
    expect(findTab(tree, 'f')).toBeNull() // a folder isn't a tab
    expect(allTabs(tree).map((t) => t.id)).toEqual(['t0', 't1'])
  })

  it('findTabByPane finds the tab whose layout holds the pane', () => {
    const t1 = tab('t1', split('row', leaf('p1'), leaf('p2')))
    expect(findTabByPane([t1], 'p2')?.id).toBe('t1')
    expect(findTabByPane([t1], 'pX')).toBeNull()
  })

  it('isDescendant / depthOfFolder / projectOf', () => {
    const g = makeFolder('g', 'G')
    g.children.push(tab('t2', leaf('p2')))
    const f = makeFolder('f', 'F')
    f.children.push(g)
    expect(isDescendant(f, 't2')).toBe(true)
    expect(isDescendant(f, 'nope')).toBe(false)
    expect(depthOfFolder([f], 'f')).toBe(1)
    expect(depthOfFolder([f], 'g')).toBe(2)
    const p = makeProject('p', 'P', '/repo')
    p.children.push(tab('t3', leaf('p3')))
    expect(projectOf([p], 't3')?.id).toBe('p')
    expect(projectOf([tab('t0', leaf('p0'))], 't0')).toBeNull()
  })

  it('collectPinnedRoots stops at the outermost pinned node', () => {
    const f = makeFolder('f', 'F')
    f.pinned = true
    f.children.push(tab('t1', leaf('p1'), true))
    expect(collectPinnedRoots([f]).map((n) => n.id)).toEqual(['f']) // inner pinned tab excluded
  })
})
