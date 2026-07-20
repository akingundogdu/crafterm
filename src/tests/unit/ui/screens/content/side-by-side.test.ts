// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@views/state/spine', () => ({ state: { tree: [] }, poppedOut: new Map() }))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/tree/tree', () => ({ findTab: () => null }))
vi.mock('@services', () => ({ terminalService: {} }))

const { tabContainers, setSideBySide, sideBySideTabs, isSideBySide, isTabTiled, exitSideBySide } =
  await import('@views/screens/content/content.store')

describe('side-by-side view state', () => {
  beforeEach(() => {
    exitSideBySide()
    tabContainers.clear()
  })

  it('is off until more than one terminal is put in it', () => {
    expect(isSideBySide()).toBe(false)

    setSideBySide(['t1'])
    expect(isSideBySide()).toBe(false)

    setSideBySide(['t1', 't2'])
    expect(isSideBySide()).toBe(true)
    expect(sideBySideTabs()).toEqual(['t1', 't2'])
  })

  it('invalidates every tab container on the way out — their panes were borrowed', () => {
    tabContainers.set('t1', { el: document.createElement('div'), sig: 'sig-1' })
    tabContainers.set('t2', { el: document.createElement('div'), sig: 'sig-2' })
    setSideBySide(['t1', 't2'])

    exitSideBySide()

    expect(isSideBySide()).toBe(false)
    expect(sideBySideTabs()).toEqual([])
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

  it('leaves the containers alone when the view was never on', () => {
    tabContainers.set('t1', { el: document.createElement('div'), sig: 'sig-1' })

    exitSideBySide()

    expect(tabContainers.get('t1')?.sig).toBe('sig-1')
  })
})
