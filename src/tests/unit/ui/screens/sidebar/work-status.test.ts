import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SidebarNode, TabNode, WorktreeNode, TabWorkStatus } from '@views/types/types'

const spine = vi.hoisted(() => ({
  panes: new Map<string, { dailyTaskId?: string }>(),
  taskStatus: new Map<string, string>()
}))

vi.mock('@views/screens/content/content.store', () => ({
  setSideBySide: () => {},
  exitSideBySide: () => {}
}))
vi.mock('@views/state/spine', () => ({
  state: { tree: [] },
  panes: spine.panes,
  settings: {},
  paneActions: { dailyTaskStatus: (taskId: string) => spine.taskStatus.get(taskId) ?? null },
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

const { tabWorkStatus, splitPinnedByStatus } = await import('@views/screens/sidebar/sidebar.store')

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

const ids = (nodes: SidebarNode[]): string[] => nodes.map((n) => n.id)
const keepAll = (): boolean => true

beforeEach(() => {
  spine.panes.clear()
  spine.taskStatus.clear()
})

describe('tabWorkStatus', () => {
  it('is null for a tab with no hand-set status and no ticket', () => {
    expect(tabWorkStatus(tab('a'))).toBeNull()
  })

  it('returns the hand-set status', () => {
    expect(tabWorkStatus(tab('a', { marked: 'test' }))).toBe('test')
    expect(tabWorkStatus(tab('b', { marked: 'review' }))).toBe('review')
    expect(tabWorkStatus(tab('c', { marked: 'progress' }))).toBe('progress')
  })

  it('falls back to the ticket status of a pane in the tab', () => {
    spine.panes.set('p-a', { dailyTaskId: 'task-1' })
    spine.taskStatus.set('task-1', 'test')
    expect(tabWorkStatus(tab('a'))).toBe('test')
  })

  it('maps a wip ticket to in progress', () => {
    spine.panes.set('p-a', { dailyTaskId: 'task-1' })
    spine.taskStatus.set('task-1', 'wip')
    expect(tabWorkStatus(tab('a'))).toBe('progress')
  })

  it('ranks ticket statuses review over test over wip', () => {
    const multi = (id: string): TabNode => ({
      ...tab(id),
      root: {
        type: 'split',
        dir: 'row',
        sizes: [50, 50],
        children: [
          { type: 'leaf', paneId: 'p-' + id + '-1' },
          { type: 'leaf', paneId: 'p-' + id + '-2' }
        ]
      }
    })
    spine.panes.set('p-a-1', { dailyTaskId: 'wip-task' })
    spine.panes.set('p-a-2', { dailyTaskId: 'test-task' })
    spine.taskStatus.set('wip-task', 'wip')
    spine.taskStatus.set('test-task', 'test')
    expect(tabWorkStatus(multi('a'))).toBe('test')
  })

  it('ignores ticket statuses outside review/test/wip', () => {
    spine.panes.set('p-a', { dailyTaskId: 'task-1' })
    spine.taskStatus.set('task-1', 'todo')
    expect(tabWorkStatus(tab('a'))).toBeNull()
  })

  it('prefers the hand-set status over the ticket status', () => {
    spine.panes.set('p-a', { dailyTaskId: 'task-1' })
    spine.taskStatus.set('task-1', 'test')
    expect(tabWorkStatus(tab('a', { marked: 'review' }))).toBe('review')
  })
})

describe('splitPinnedByStatus', () => {
  it('moves pinned tabs with a status into their group', () => {
    const split = splitPinnedByStatus(
      [
        tab('t', { pinned: true, marked: 'test' }),
        tab('r', { pinned: true, marked: 'review' }),
        tab('p', { pinned: true, marked: 'progress' }),
        tab('x', { pinned: true })
      ],
      keepAll
    )
    expect(ids(split.test)).toEqual(['t'])
    expect(ids(split.review)).toEqual(['r'])
    expect(ids(split.progress)).toEqual(['p'])
    expect(ids(split.rest)).toEqual(['x'])
  })

  it('pulls a status tab out of a pinned worktree, keeping the rest there', () => {
    const wt = worktree('wt', [tab('a', { marked: 'test' }), tab('b')], true)
    const split = splitPinnedByStatus([wt], keepAll)

    expect(ids(split.test)).toEqual(['a'])
    expect(split.rest).toHaveLength(1)
    const kept = split.rest[0] as WorktreeNode
    expect(kept.id).toBe('wt')
    expect(ids(kept.children)).toEqual(['b'])
  })

  it('keeps an emptied pinned worktree in the Pinned group', () => {
    const wt = worktree('wt', [tab('a', { marked: 'review' })], true)
    const split = splitPinnedByStatus([wt], keepAll)

    expect(ids(split.review)).toEqual(['a'])
    expect(ids(split.rest)).toEqual(['wt'])
  })

  it('leaves the live tree untouched', () => {
    const wt = worktree('wt', [tab('a', { marked: 'test' }), tab('b')], true)
    splitPinnedByStatus([wt], keepAll)
    expect(ids(wt.children)).toEqual(['a', 'b'])
  })

  it('does not pull a filtered-out (archived) tab into a status group', () => {
    const wt = worktree('wt', [tab('a', { marked: 'test', archived: true }), tab('b')], true)
    const split = splitPinnedByStatus([wt], (n) => n.kind !== 'tab' || n.status !== 'archived')

    expect(split.test).toEqual([])
    expect(ids((split.rest[0] as WorktreeNode).children)).toEqual(['a', 'b'])
  })

  it('groups a pinned tab by its ticket status', () => {
    spine.panes.set('p-a', { dailyTaskId: 'task-1' })
    spine.taskStatus.set('task-1', 'review')
    const split = splitPinnedByStatus([tab('a', { pinned: true })], keepAll)
    expect(ids(split.review)).toEqual(['a'])
  })

  it('groups a pinned tab with a wip ticket under in progress', () => {
    spine.panes.set('p-a', { dailyTaskId: 'task-1' })
    spine.taskStatus.set('task-1', 'wip')
    const split = splitPinnedByStatus([tab('a', { pinned: true })], keepAll)
    expect(ids(split.progress)).toEqual(['a'])
  })
})
