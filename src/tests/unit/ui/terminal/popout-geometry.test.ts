import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Pane } from '@views/types/types'

const spine = vi.hoisted(() => ({
  panes: new Map<string, Pane>(),
  poppedOut: new Set<string>(),
  resizes: [] as Array<[string, number, number]>
}))

vi.mock('@views/state/spine', () => ({ panes: spine.panes, poppedOut: spine.poppedOut }))
// The real pushResize: send only when the grid differs from the last one sent.
vi.mock('@views/terminal/terminal.store', () => ({
  pushResize: (p: Pane) => {
    if (p.term.cols === p.lastCols && p.term.rows === p.lastRows) return
    p.lastCols = p.term.cols
    p.lastRows = p.term.rows
    spine.resizes.push([p.id, p.term.cols, p.term.rows])
  }
}))

const { mirrorPopoutSize, refitDockedPane } = await import('@views/terminal/popout-geometry')

// A pane whose xterm sits at `cols`x`rows`; fit() snaps it to `boxCols`x`boxRows`.
function pane(id: string, cols: number, rows: number, boxCols = cols, boxRows = rows): Pane {
  const term = {
    cols,
    rows,
    resize(c: number, r: number) {
      term.cols = c
      term.rows = r
    }
  }
  const p = {
    id,
    term,
    fit: { fit: () => term.resize(boxCols, boxRows) },
    lastCols: cols,
    lastRows: rows
  }
  return p as unknown as Pane
}

describe('mirrorPopoutSize', () => {
  beforeEach(() => {
    spine.panes.clear()
    spine.poppedOut.clear()
  })

  it('puts a popped-out pane on the pop-out window grid', () => {
    const p = pane('a', 200, 50)
    spine.panes.set('a', p)
    spine.poppedOut.add('a')
    mirrorPopoutSize('a', 90, 30)
    expect([p.term.cols, p.term.rows]).toEqual([90, 30])
  })

  it('leaves a docked pane alone (a late event after docking back)', () => {
    const p = pane('a', 200, 50)
    spine.panes.set('a', p)
    mirrorPopoutSize('a', 90, 30)
    expect([p.term.cols, p.term.rows]).toEqual([200, 50])
  })
})

describe('refitDockedPane', () => {
  beforeEach(() => {
    spine.resizes.length = 0
  })

  it('pushes the box size to the PTY even when the grid matches the last size sent', () => {
    // The pane last sent 200x50 before popping out; its box still fits 200x50,
    // but the PTY now runs at the pop-out size — the resize must still go out.
    const p = pane('a', 90, 30, 200, 50)
    p.lastCols = 200
    p.lastRows = 50
    refitDockedPane(p)
    expect(spine.resizes).toEqual([['a', 200, 50]])
  })
})
