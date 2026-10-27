import { describe, it, expect, beforeEach } from 'vitest'
import { isFullyPoppedOut } from '@views/screens/content/content.store'
import { poppedOut } from '@views/state/spine'
import type { LayoutNode, Dir } from '@views/types/types'

const leaf = (paneId: string): LayoutNode => ({ type: 'leaf', paneId })
const split = (dir: Dir, ...children: LayoutNode[]): LayoutNode => ({ type: 'split', dir, sizes: children.map(() => 0.5), children })

// isFullyPoppedOut decides which layout nodes the main window drops because every
// pane under them lives in a pop-out window.
describe('isFullyPoppedOut', () => {
  beforeEach(() => poppedOut.clear())

  it('is true for a popped-out leaf and false for a docked one', () => {
    poppedOut.add('a')
    expect(isFullyPoppedOut(leaf('a'))).toBe(true)
    expect(isFullyPoppedOut(leaf('b'))).toBe(false)
  })

  it('is true for a split only when every descendant leaf is popped out', () => {
    const tree = split('row', leaf('a'), split('col', leaf('b'), leaf('c')))
    poppedOut.add('a')
    poppedOut.add('b')
    expect(isFullyPoppedOut(tree)).toBe(false)
    poppedOut.add('c')
    expect(isFullyPoppedOut(tree)).toBe(true)
  })
})
