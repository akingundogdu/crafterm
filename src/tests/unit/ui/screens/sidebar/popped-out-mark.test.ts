import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TabNode, LayoutNode } from '@views/types/types'

const spine = vi.hoisted(() => ({ poppedOut: new Set<string>(), dockPane: vi.fn() }))

vi.mock('@views/screens/content/content.store', () => ({
  setSideBySide: () => {},
  exitSideBySide: () => {}
}))
vi.mock('@views/state/spine', () => ({
  state: { tree: [] },
  panes: new Map(),
  poppedOut: spine.poppedOut,
  settings: {},
  paneActions: {},
  renderContent: () => {},
  requestSidebar: () => {}
}))
vi.mock('@services/bgproc', () => ({ openProcessView: () => {}, killProcess: () => {} }))
vi.mock('@views/pane/pane', () => ({ paneStatus: () => 'idle', isPlanOwnedByPane: () => false }))
vi.mock('@views/commands/commands', () => ({
  selectPane: () => {},
  openMarkdownFile: () => {},
  toggleTabDetails: () => {},
  openTerminalRunning: () => {},
  contextFolderId: () => null,
  runInSplit: () => {},
  dockPane: spine.dockPane
}))
vi.mock('@views/screens/pickers/project/project', () => ({ showProjectPicker: () => {} }))
vi.mock('@views/screens/pickers/update/update', () => ({ runUpdate: () => {} }))
vi.mock('@views/screens/pickers/command/command', () => ({
  showCommandPalette: () => {},
  showCommandHistory: () => {}
}))
vi.mock('@views/screens/pickers/ssh/ssh', () => ({ showSshConnections: () => {} }))
vi.mock('@views/screens/pickers/claude/claude', () => ({
  showClaudeDashboard: () => {},
  showClaudeAccountSwitcher: () => {},
  showClaudeSessionResume: () => {}
}))

const { tabPoppedOut, makeDockTabClick } = await import('@views/screens/sidebar/sidebar.store')
const { badgeClass } = await import('@views/components/tree/components/tree-row.store')

const tab = (root: LayoutNode): TabNode => ({ kind: 'tab', id: 't1', root }) as TabNode
const leaf = (paneId: string): LayoutNode => ({ type: 'leaf', paneId })

// A terminal row in the sidebar carries a pop-out mark while any of its panes
// lives in its own window.
describe('tabPoppedOut', () => {
  beforeEach(() => spine.poppedOut.clear())

  it('is false while every pane is docked', () => {
    expect(tabPoppedOut(tab(leaf('a')))).toBe(false)
  })

  it('is true when any pane of the tab is popped out', () => {
    spine.poppedOut.add('b')
    const split: LayoutNode = { type: 'split', dir: 'row', sizes: [0.5, 0.5], children: [leaf('a'), leaf('b')] }
    expect(tabPoppedOut(tab(split))).toBe(true)
  })
})

// The row's "Bring back to Crafterm" action docks only the panes that are out.
describe('makeDockTabClick', () => {
  beforeEach(() => {
    spine.poppedOut.clear()
    spine.dockPane.mockClear()
  })

  it('docks every popped-out pane of the tab and leaves docked ones alone', () => {
    spine.poppedOut.add('b')
    spine.poppedOut.add('c')
    const split: LayoutNode = {
      type: 'split',
      dir: 'row',
      sizes: [1, 1, 1],
      children: [leaf('a'), leaf('b'), leaf('c')]
    }
    makeDockTabClick(tab(split))()
    expect(spine.dockPane.mock.calls.map((c) => c[0])).toEqual(['b', 'c'])
  })
})

describe('badgeClass', () => {
  it('gives the pop-out mark its own class', () => {
    expect(badgeClass({ kind: 'popout', text: '⧉' })).toBe('crtree-badge crtree-popout')
  })
})
