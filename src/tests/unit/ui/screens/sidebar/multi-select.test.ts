import { describe, it, expect, beforeEach, vi } from 'vitest'

const setSideBySide = vi.fn()
const exitSideBySide = vi.fn()
const renderContent = vi.fn()
const requestSidebar = vi.fn()

vi.mock('@views/screens/content/content.store', () => ({
  setSideBySide: (ids: string[]) => setSideBySide(ids),
  exitSideBySide: () => exitSideBySide()
}))
vi.mock('@views/state/spine', () => ({
  state: { tree: [] },
  panes: new Map(),
  settings: {},
  paneActions: {},
  renderContent: () => renderContent(),
  requestSidebar: () => requestSidebar()
}))
vi.mock('@services/bgproc', () => ({ openProcessView: () => {}, killProcess: () => {} }))
vi.mock('@views/tree/tree', () => ({
  allTabs: () => [],
  panesInLayout: () => [],
  firstPaneOf: () => null,
  ancestorFolders: () => []
}))
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

const {
  isMultiSelected,
  multiSelectedIds,
  toggleMultiSelect,
  clearMultiSelect,
  showSideBySide,
  clearSideBySideSelection
} = await import('@views/screens/sidebar/sidebar.store')

describe('sidebar multi-select (todomraex8usk1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMultiSelect()
  })

  it('marks and unmarks a terminal', () => {
    toggleMultiSelect('t1')
    toggleMultiSelect('t2')
    expect(multiSelectedIds()).toEqual(['t1', 't2'])
    expect(isMultiSelected('t1')).toBe(true)

    toggleMultiSelect('t1')
    expect(multiSelectedIds()).toEqual(['t2'])
    expect(isMultiSelected('t1')).toBe(false)
  })

  it('hands the marked terminals to the content area', () => {
    toggleMultiSelect('t1')
    toggleMultiSelect('t2')

    showSideBySide(multiSelectedIds())

    expect(setSideBySide).toHaveBeenCalledWith(['t1', 't2'])
    expect(renderContent).toHaveBeenCalledTimes(1)
  })

  it('clearing the selection leaves the view and drops every mark', () => {
    toggleMultiSelect('t1')
    toggleMultiSelect('t2')

    clearSideBySideSelection()

    expect(multiSelectedIds()).toEqual([])
    expect(exitSideBySide).toHaveBeenCalledTimes(1)
    expect(renderContent).toHaveBeenCalledTimes(1)
  })
})
