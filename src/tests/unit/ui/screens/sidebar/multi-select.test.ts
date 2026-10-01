import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SidebarNode, TabNode, TabWorkStatus, WorktreeNode } from '@views/types/types'

const setSideBySide = vi.fn()
const exitSideBySide = vi.fn()
const renderContent = vi.fn()
const requestSidebar = vi.fn()

vi.mock('@views/screens/content/content.store', () => ({
  setSideBySide: (ids: string[]) => setSideBySide(ids),
  exitSideBySide: () => exitSideBySide()
}))
const spine = vi.hoisted(() => ({ state: { tree: [] as SidebarNode[] } }))

vi.mock('@views/state/spine', () => ({
  state: spine.state,
  panes: new Map(),
  settings: {},
  paneActions: {},
  renderContent: () => renderContent(),
  requestSidebar: () => requestSidebar()
}))
vi.mock('@services/bgproc', () => ({ openProcessView: () => {}, killProcess: () => {} }))
vi.mock('@views/tree/tree', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@views/tree/tree')>()),
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
  markMultiSelected,
  showSideBySide,
  clearSideBySideSelection,
  pinnedTabsWithStatus,
  showTabsSideBySide
} = await import('@views/screens/sidebar/sidebar.store')

const tab = (id: string, opts: { pinned?: boolean; marked?: TabWorkStatus; archived?: boolean } = {}): TabNode => ({
  kind: 'tab',
  id,
  title: id,
  titleLocked: false,
  color: null,
  pinned: !!opts.pinned,
  root: { type: 'leaf', paneId: 'p-' + id },
  ...(opts.marked ? { markedStatus: opts.marked } : {}),
  ...(opts.archived ? { status: 'archived' as const } : {})
})

const worktree = (id: string, children: SidebarNode[], pinned = false): WorktreeNode => ({
  kind: 'worktree',
  id,
  name: id,
  branch: id,
  worktreePath: '/repo/worktrees/' + id,
  color: null,
  collapsed: false,
  pinned,
  children
})

describe('sidebar multi-select (todomraex8usk1)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMultiSelect()
    spine.state.tree = [tab('t1'), tab('t2'), tab('t3')]
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

  it('marks a terminal added from inside the view without toggling it off', () => {
    markMultiSelected('t1')
    markMultiSelected('t1')
    expect(multiSelectedIds()).toEqual(['t1'])
    expect(isMultiSelected('t1')).toBe(true)
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

  it('stops counting a marked terminal once it is closed', () => {
    toggleMultiSelect('t1')
    toggleMultiSelect('t2')
    toggleMultiSelect('t3')
    spine.state.tree = [tab('t1'), tab('t2', { archived: true })]

    expect(multiSelectedIds()).toEqual(['t1'])
  })
})

describe('viewing a status section side by side', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearMultiSelect()
  })

  it('lists the live pinned terminals in progress, including ones inside a pinned worktree', () => {
    spine.state.tree = [
      tab('a', { pinned: true, marked: 'progress' }),
      tab('b', { pinned: true, marked: 'review' }),
      tab('c', { pinned: true }),
      tab('d', { marked: 'progress' }),
      tab('e', { pinned: true, marked: 'progress', archived: true }),
      worktree('wt', [tab('f', { marked: 'progress' }), tab('g')], true)
    ]

    expect(pinnedTabsWithStatus('progress').map((t) => t.id)).toEqual(['a', 'f'])
  })

  it('tiles the section and marks exactly its rows', () => {
    toggleMultiSelect('t3')

    showTabsSideBySide(['t1', 't2'])

    expect(setSideBySide).toHaveBeenCalledWith(['t1', 't2'])
    expect(renderContent).toHaveBeenCalledTimes(1)
    expect(requestSidebar).toHaveBeenCalledTimes(1)
    spine.state.tree = [tab('t1'), tab('t2'), tab('t3')]
    expect(multiSelectedIds()).toEqual(['t1', 't2'])
    expect(isMultiSelected('t3')).toBe(false)
  })
})
