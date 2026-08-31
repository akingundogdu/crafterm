import { describe, it, expect } from 'vitest'
import { flattenSections, TreeStore } from '@views/components/tree/tree.store'
import type { TreeRow, TreeSectionData, FlatRow } from '@views/components/tree/tree.types'

// Pure flatten/guides/filter logic of the modern data-driven tree — no DOM.

function leaf(id: string, label = id): TreeRow {
  return { id, label, isContainer: false, collapsed: false }
}
function folder(id: string, children: TreeRow[], collapsed = false): TreeRow {
  return { id, label: id, isContainer: true, collapsed, children }
}

function flatten(sections: TreeSectionData[], filter = ''): ReturnType<typeof flattenSections> {
  return flattenSections(sections, filter, new Map(), new Map())
}

const rows = (items: ReturnType<typeof flattenSections>): FlatRow[] =>
  items.filter((i): i is FlatRow => i.kind === 'row')

describe('tree flatten', () => {
  it('flattens nested rows top-to-bottom with depth', () => {
    const sections: TreeSectionData[] = [
      { id: 's', rows: [folder('p', [leaf('a'), leaf('b')])] }
    ]
    const flat = rows(flatten(sections))
    expect(flat.map((r) => r.row.id)).toEqual(['p', 'a', 'b'])
    expect(flat.map((r) => r.depth)).toEqual([0, 1, 1])
    expect(flat.map((r) => r.num)).toEqual([0, 1, 2])
  })

  it('hides children of a collapsed container', () => {
    const sections: TreeSectionData[] = [{ id: 's', rows: [folder('p', [leaf('a')], true)] }]
    expect(rows(flatten(sections)).map((r) => r.row.id)).toEqual(['p'])
  })

  it('reveals matches inside a collapsed container when filtering', () => {
    const sections: TreeSectionData[] = [{ id: 's', rows: [folder('p', [leaf('a', 'needle')], true)] }]
    expect(rows(flatten(sections, 'needle')).map((r) => r.row.id)).toEqual(['p', 'a'])
  })

  it('drops non-matching rows under a filter', () => {
    const sections: TreeSectionData[] = [{ id: 's', rows: [leaf('a', 'apple'), leaf('b', 'banana')] }]
    expect(rows(flatten(sections, 'ban')).map((r) => r.row.id)).toEqual(['b'])
  })

  it('keeps a labelled header but drops one whose section filters empty', () => {
    const sections: TreeSectionData[] = [
      { id: 'keep', label: 'Keep', rows: [leaf('a', 'apple')] },
      { id: 'gone', label: 'Gone', rows: [leaf('b', 'banana')] }
    ]
    const items = flatten(sections, 'apple')
    expect(items.filter((i) => i.kind === 'header').map((h) => (h.kind === 'header' ? h.section.id : ''))).toEqual([
      'keep'
    ])
    expect(rows(items).map((r) => r.row.id)).toEqual(['a'])
  })

  it('computes guide flags from ancestor following-siblings', () => {
    // p1 has a following sibling p2 → its descendants draw a continuing guide at level 0.
    const sections: TreeSectionData[] = [
      { id: 's', rows: [folder('p1', [leaf('a')]), folder('p2', [leaf('b')])] }
    ]
    const flat = rows(flatten(sections))
    const a = flat.find((r) => r.row.id === 'a')!
    const b = flat.find((r) => r.row.id === 'b')!
    expect(a.guides).toEqual([true]) // p1 still has p2 below
    expect(b.guides).toEqual([false]) // p2 is the last root
  })

  it('setFlat bumps the store rev', () => {
    const store = new TreeStore()
    expect(store.rev).toBe(0)
    store.setFlat(flatten([{ id: 's', rows: [leaf('a')] }]))
    expect(store.rev).toBe(1)
    expect(store.flat.length).toBe(1)
  })
})
