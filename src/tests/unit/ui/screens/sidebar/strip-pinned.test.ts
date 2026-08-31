import { describe, it, expect, vi } from 'vitest'
import type { SidebarNode, TabNode, WorktreeNode } from '@views/types/types'

vi.mock('@views/screens/content/content.store', () => ({
  setSideBySide: () => {},
  exitSideBySide: () => {}
}))
vi.mock('@views/state/spine', () => ({
  state: { tree: [] },
  panes: new Map(),
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

const { stripPinned } = await import('@views/screens/sidebar/sidebar.store')
const { collectPinnedRoots, makeFolder, makeProject } = await import('@views/tree/tree')

const tab = (id: string, pinned = false): TabNode => ({
  kind: 'tab',
  id,
  title: id,
  titleLocked: false,
  color: null,
  pinned,
  root: { type: 'leaf', paneId: 'p-' + id }
})

const worktree = (id: string, children: SidebarNode[]): WorktreeNode => ({
  kind: 'worktree',
  id,
  name: id,
  branch: id,
  worktreePath: '/repo/worktrees/' + id,
  color: null,
  collapsed: false,
  pinned: false,
  children
})

const idsOf = (nodes: SidebarNode[]): string[] => {
  const out: string[] = []
  const walk = (list: SidebarNode[]): void => {
    for (const n of list) {
      out.push(n.id)
      if (n.kind !== 'tab') walk(n.children)
    }
  }
  walk(nodes)
  return out
}

describe('stripPinned', () => {
  it('drops a pinned terminal nested under a worktree', () => {
    const wt = worktree('wt', [tab('pinned-tab', true), tab('plain-tab')])
    const proj = makeProject('proj', 'Proj', '/repo')
    const wtContainer = makeFolder('worktrees', 'worktrees')
    wtContainer.children.push(wt)
    proj.children.push(wtContainer)

    expect(idsOf(stripPinned([proj]))).toEqual(['proj', 'worktrees', 'wt', 'plain-tab'])
  })

  it('leaves the original tree untouched', () => {
    const wt = worktree('wt', [tab('pinned-tab', true)])
    stripPinned([wt])
    expect(wt.children.map((c) => c.id)).toEqual(['pinned-tab'])
  })

  it('renders every pinned node exactly once across both sections', () => {
    const wt = worktree('wt', [tab('pinned-tab', true), tab('plain-tab')])
    const folder = makeFolder('f', 'F')
    folder.children.push(wt, tab('pinned-free', true))
    const tree: SidebarNode[] = [folder]

    const pinnedIds = collectPinnedRoots(tree).map((n) => n.id)
    const mainIds = idsOf(stripPinned(tree))

    expect(pinnedIds).toEqual(['pinned-tab', 'pinned-free'])
    expect(mainIds.filter((id) => pinnedIds.includes(id))).toEqual([])
  })
})
