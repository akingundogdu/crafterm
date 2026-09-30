// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { LayoutNode } from '@views/types/types'

// Tabs the view can tile: each contributes its first pane (a split tab's root
// still yields one tile). Kept as a mutable map so a test can seed its own tabs.
const tabs: Record<string, { id: string; root: LayoutNode; status?: 'archived' }> = {}
const tab = (id: string, paneId: string): void => {
  tabs[id] = { id, root: { type: 'leaf', paneId } }
}

const spine = vi.hoisted(() => ({
  state: { tree: [], activeTabId: null, activePaneId: null, selectedNodeId: null } as {
    tree: never[]
    activeTabId: string | null
    activePaneId: string | null
    selectedNodeId: string | null
  }
}))
vi.mock('@views/state/spine', () => ({ state: spine.state, poppedOut: new Map() }))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/tree/tree', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@views/tree/tree')>()),
  findTab: (_tree: unknown, id: string) => tabs[id] ?? null
}))
vi.mock('@services', () => ({ terminalService: {} }))

const {
  tabContainers,
  setSideBySide,
  sideBySideTabs,
  sideBySideLayout,
  isSideBySide,
  isTabTiled,
  exitSideBySide,
  addSideBySideTab,
  moveSideBySidePane,
  pruneSideBySide,
  rowOfPanes
} = await import('@views/screens/content/content.store')

const paneIdsOf = (node: LayoutNode | null): unknown =>
  !node ? null : node.type === 'leaf' ? node.paneId : { [node.dir]: node.children.map(paneIdsOf) }

describe('side-by-side view state', () => {
  beforeEach(() => {
    exitSideBySide()
    tabContainers.clear()
    for (const k of Object.keys(tabs)) delete tabs[k]
    tab('t1', 'p1')
    tab('t2', 'p2')
    tab('t3', 'p3')
  })

  it('is off until more than one terminal is put in it', () => {
    expect(isSideBySide()).toBe(false)

    setSideBySide(['t1'])
    expect(isSideBySide()).toBe(false)

    setSideBySide(['t1', 't2'])
    expect(isSideBySide()).toBe(true)
    expect(sideBySideTabs()).toEqual(['t1', 't2'])
  })

  it('starts as one equal-width row of the tabs’ first panes', () => {
    setSideBySide(['t1', 't2', 't3'])

    expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p1', 'p2', 'p3'] })
    const root = sideBySideLayout()
    expect(root?.type === 'split' && root.sizes).toEqual([1, 1, 1])
  })

  it('skips a marked tab that no longer exists when laying out', () => {
    setSideBySide(['t1', 'gone', 't2'])
    expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p1', 'p2'] })
  })

  it('invalidates every tab container on the way out — their panes were borrowed', () => {
    tabContainers.set('t1', { el: document.createElement('div'), sig: 'sig-1' })
    tabContainers.set('t2', { el: document.createElement('div'), sig: 'sig-2' })
    setSideBySide(['t1', 't2'])

    exitSideBySide()

    expect(isSideBySide()).toBe(false)
    expect(sideBySideTabs()).toEqual([])
    expect(sideBySideLayout()).toBeNull()
    expect([...tabContainers.values()].map((e) => e.sig)).toEqual(['', ''])
  })

  it('knows which terminals are on screen as tiles', () => {
    setSideBySide(['t1', 't2'])

    // Clicking a pane inside a tile keeps the view; any other pane leaves it.
    expect(isTabTiled('t1')).toBe(true)
    expect(isTabTiled('t3')).toBe(false)

    exitSideBySide()
    expect(isTabTiled('t1')).toBe(false)
  })

  it('grows by one tile beside the active one, never twice for the same terminal', () => {
    setSideBySide(['t1', 't2'])

    addSideBySideTab('t3', 'p1')
    addSideBySideTab('t3', 'p1')

    expect(sideBySideTabs()).toEqual(['t1', 't2', 't3'])
    expect(isTabTiled('t3')).toBe(true)
    expect(paneIdsOf(sideBySideLayout())).toEqual({ row: [{ row: ['p1', 'p3'] }, 'p2'] })
  })

  it('appends at the end of the row when there is no tile to sit beside', () => {
    setSideBySide(['t1', 't2'])

    addSideBySideTab('t3', null)

    expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p1', 'p2', 'p3'] })
  })

  it('does not start a view by adding to it while it is off', () => {
    addSideBySideTab('t1')
    expect(sideBySideTabs()).toEqual([])
    expect(isSideBySide()).toBe(false)
  })

  it('drops a tile below another one so two tiles stack while the rest stay side by side', () => {
    setSideBySide(['t1', 't2', 't3'])

    expect(moveSideBySidePane('p3', 'p1', 'col', false)).toBe(true)

    expect(paneIdsOf(sideBySideLayout())).toEqual({ row: [{ col: ['p1', 'p3'] }, 'p2'] })
  })

  it('refuses a drop that involves a pane outside the view', () => {
    setSideBySide(['t1', 't2'])

    expect(moveSideBySidePane('p9', 'p1', 'row', true)).toBe(false)
    expect(moveSideBySidePane('p1', 'p9', 'row', true)).toBe(false)
    expect(moveSideBySidePane('p1', 'p1', 'row', true)).toBe(false)
    expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p1', 'p2'] })
  })

  it('leaves the containers alone when the view was never on', () => {
    tabContainers.set('t1', { el: document.createElement('div'), sig: 'sig-1' })

    exitSideBySide()

    expect(tabContainers.get('t1')?.sig).toBe('sig-1')
  })

  it('builds a lone leaf or an equal row from pane ids', () => {
    expect(rowOfPanes([])).toBeNull()
    expect(paneIdsOf(rowOfPanes(['p1']))).toBe('p1')
    expect(paneIdsOf(rowOfPanes(['p1', 'p2']))).toEqual({ row: ['p1', 'p2'] })
  })

  describe('closing a tile', () => {
    beforeEach(() => {
      tab('t4', 'p4')
      tab('t5', 'p5')
      spine.state.activeTabId = null
      spine.state.activePaneId = null
      spine.state.selectedNodeId = null
    })

    it('drops the closed terminal’s slot so the rest re-tile', () => {
      setSideBySide(['t1', 't2', 't3', 't4', 't5'])
      tabs.t3.status = 'archived'

      pruneSideBySide()

      expect(sideBySideTabs()).toEqual(['t1', 't2', 't4', 't5'])
      expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p1', 'p2', 'p4', 'p5'] })
      expect(isTabTiled('t3')).toBe(false)
    })

    it('drops a tile whose pane was closed out of a still-open tab', () => {
      tabs.t2.root = { type: 'leaf', paneId: 'p2b' }
      setSideBySide(['t1', 't2', 't3'])
      tabs.t2.root = { type: 'leaf', paneId: 'p2c' }

      pruneSideBySide()

      expect(sideBySideTabs()).toEqual(['t1', 't3'])
      expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p1', 'p3'] })
    })

    it('keeps a dragged arrangement, only removing the closed tile', () => {
      setSideBySide(['t1', 't2', 't3'])
      moveSideBySidePane('p3', 'p1', 'col', false)
      delete tabs.t1

      pruneSideBySide()

      expect(paneIdsOf(sideBySideLayout())).toEqual({ row: ['p3', 'p2'] })
    })

    it('moves focus to the first remaining tile when the active one was closed', () => {
      setSideBySide(['t1', 't2', 't3'])
      spine.state.activeTabId = 't1'
      spine.state.activePaneId = 'p1'
      tabs.t1.status = 'archived'

      pruneSideBySide()

      expect(spine.state.activeTabId).toBe('t2')
      expect(spine.state.activePaneId).toBe('p2')
      expect(spine.state.selectedNodeId).toBe('t2')
    })

    it('leaves focus alone when another tile was closed', () => {
      setSideBySide(['t1', 't2', 't3'])
      spine.state.activeTabId = 't3'
      spine.state.activePaneId = 'p3'
      tabs.t1.status = 'archived'

      pruneSideBySide()

      expect(spine.state.activeTabId).toBe('t3')
      expect(spine.state.activePaneId).toBe('p3')
    })

    it('ends the view and shows the last terminal on its own when one tile is left', () => {
      tabContainers.set('t2', { el: document.createElement('div'), sig: 'sig-2' })
      setSideBySide(['t1', 't2'])
      spine.state.activeTabId = 't1'
      tabs.t1.status = 'archived'

      pruneSideBySide()

      expect(isSideBySide()).toBe(false)
      expect(sideBySideLayout()).toBeNull()
      expect(spine.state.activeTabId).toBe('t2')
      expect(spine.state.activePaneId).toBe('p2')
      expect(tabContainers.get('t2')?.sig).toBe('')
    })

    it('changes nothing while every tile is still open', () => {
      setSideBySide(['t1', 't2'])
      moveSideBySidePane('p2', 'p1', 'col', false)
      const before = sideBySideLayout()

      pruneSideBySide()

      expect(sideBySideLayout()).toBe(before)
      expect(sideBySideTabs()).toEqual(['t1', 't2'])
    })
  })
})
