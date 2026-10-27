import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TabNode, LayoutNode } from '@views/types/types'

const spine = vi.hoisted(() => ({ poppedOut: new Set<string>() }))

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
  runInSplit: () => {}
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

const { tabPoppedOut } = await import('@views/screens/sidebar/sidebar.store')
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

describe('badgeClass', () => {
  it('gives the pop-out mark its own class', () => {
    expect(badgeClass({ kind: 'popout', text: '⧉' })).toBe('crtree-badge crtree-popout')
  })
})
