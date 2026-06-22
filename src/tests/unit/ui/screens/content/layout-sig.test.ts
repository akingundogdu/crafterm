import { describe, it, expect } from 'vitest'
import { layoutSig } from '@ui/screens/content/content.state'
import type { LayoutNode, Dir } from '@ui/types/types'

const leaf = (paneId: string): LayoutNode => ({ type: 'leaf', paneId })
const split = (dir: Dir, ...children: LayoutNode[]): LayoutNode => ({ type: 'split', dir, sizes: children.map(() => 0.5), children })

// layoutSig is the structural fingerprint the content controller uses to skip a
// DOM rebuild when the layout is unchanged.
describe('layoutSig', () => {
  it('fingerprints a leaf + a split structurally', () => {
    expect(layoutSig(leaf('p1'))).toBe('p1')
    expect(layoutSig(split('row', leaf('a'), leaf('b')))).toBe('row[0.5,0.5](a,b)')
    expect(layoutSig(split('row', leaf('a'), split('col', leaf('b'), leaf('c'))))).toBe('row[0.5,0.5](a,col[0.5,0.5](b,c))')
  })

  it('is stable for identical structures, changes when structure changes', () => {
    const a = split('row', leaf('a'), leaf('b'))
    expect(layoutSig(a)).toBe(layoutSig(split('row', leaf('a'), leaf('b'))))
    expect(layoutSig(split('col', leaf('a'), leaf('b')))).not.toBe(layoutSig(a)) // dir changed
    expect(layoutSig(split('row', leaf('a'), leaf('z')))).not.toBe(layoutSig(a)) // paneId changed
  })
})
