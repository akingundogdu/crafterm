import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode, WorktreeNode, TabNode, FolderNode } from '@views/types/types'

const listWorktrees = vi.fn()
const archiveTab = vi.fn((tab: TabNode) => {
  // Mirror the real archiveTab's observable effect the reconcile relies on.
  tab.status = 'archived'
})
const reactivateTab = vi.fn()

vi.mock('@services', () => ({
  gitService: { listWorktrees: (repo: string) => listWorktrees(repo) },
  terminalService: {},
  appService: {},
  soundService: { play: () => {} }
}))
vi.mock('@views/components/worktree-progress/worktree-progress', () => ({ showWorktreeProgress: () => ({}) }))
vi.mock('@views/components/worktree-progress/worktree-progress.store', () => ({ REMOVE_STEPS: [] }))

// A single project with an auto worktrees container holding one worktree node.
// Tests mutate `worktree`/`tab` status and the git listing, then drive a pass.
let worktree: WorktreeNode
let tab: TabNode
let container: FolderNode
let proj: ProjectNode
const state: { tree: ProjectNode[] } = { tree: [] }

function allTabsImpl(nodes: unknown[]): TabNode[] {
  const out: TabNode[] = []
  const walk = (n: { kind?: string; children?: unknown[] }): void => {
    if (n.kind === 'tab') out.push(n as unknown as TabNode)
    for (const c of n.children ?? []) walk(c as { kind?: string; children?: unknown[] })
  }
  for (const n of nodes) walk(n as { kind?: string; children?: unknown[] })
  return out
}

vi.mock('@views/state/state', () => ({
  state,
  settings: {},
  requestSidebar: () => {},
  uid: (p: string) => p + '-1',
  pushNotification: () => {},
  paneActions: { reactivateTab: (id: string) => reactivateTab(id) }
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/tree/tree', () => ({
  makeFolder: () => ({}),
  allTabs: (nodes: unknown[]) => allTabsImpl(nodes),
  projectOf: () => null
}))
vi.mock('@views/catalog/catalog', () => ({ flattenProjects: () => [proj] }))
vi.mock('@views/commands/commands', () => ({ archiveTab: (t: TabNode) => archiveTab(t) }))
vi.mock('@services/bgproc', () => ({ runHiddenAndWait: vi.fn(), removeProcess: () => {} }))
vi.mock('@views/components/dialog/prompt-form', () => ({ promptForm: async () => null }))
vi.mock('@views/components/dialog/confirm', () => ({ promptConfirm: async () => true }))

const { reconcileWorktrees } = await import('@services/worktrees')

const WT_PATH = '/repos/alpha/worktrees/CRF-1'
const ROOT = '/repos/alpha'

function goodListing() {
  return { root: ROOT, worktrees: [{ path: ROOT, branch: 'main' }, { path: WT_PATH, branch: 'CRF-1' }] }
}

beforeEach(() => {
  vi.clearAllMocks()
  tab = { kind: 'tab', id: 't1', title: 'session', titleLocked: false, color: null, pinned: false, root: { type: 'leaf', paneId: 'p1' }, status: 'idle' } as TabNode
  worktree = { kind: 'worktree', id: 'w1', name: 'CRF-1', color: null, collapsed: false, pinned: false, children: [tab], branch: 'CRF-1', worktreePath: WT_PATH, status: 'idle' } as WorktreeNode
  container = { kind: 'folder', id: 'c1', name: 'worktrees', color: null, collapsed: false, pinned: false, children: [worktree], worktreeContainer: true } as FolderNode
  proj = { kind: 'project', id: 'p1', name: 'alpha', color: null, collapsed: false, pinned: false, children: [container], path: ROOT, supportWorktree: true } as ProjectNode
  state.tree = [proj]
})

describe('reconcile — failed/empty git listing must not archive (Bug #1 Fix A)', () => {
  it('does not archive any worktree when the listing is null (git call failed)', async () => {
    listWorktrees.mockResolvedValue(null)
    await reconcileWorktrees()
    expect(archiveTab).not.toHaveBeenCalled()
    expect(worktree.status).toBe('idle')
  })

  it('does not archive when rev-parse failed (root null, no worktrees)', async () => {
    listWorktrees.mockResolvedValue({ root: null, worktrees: [] })
    await reconcileWorktrees()
    expect(archiveTab).not.toHaveBeenCalled()
    expect(worktree.status).toBe('idle')
  })

  it('does not archive when the worktree-list timed out (root set, worktrees empty)', async () => {
    listWorktrees.mockResolvedValue({ root: ROOT, worktrees: [] })
    await reconcileWorktrees()
    expect(archiveTab).not.toHaveBeenCalled()
    expect(worktree.status).toBe('idle')
  })
})

describe('reconcile — genuine removal still archives (baseline preserved)', () => {
  it('archives a worktree that a valid listing no longer reports, tagging its tabs', async () => {
    // Valid listing with only the main checkout — the linked worktree is truly gone.
    listWorktrees.mockResolvedValue({ root: ROOT, worktrees: [{ path: ROOT, branch: 'main' }] })
    await reconcileWorktrees()
    expect(archiveTab).toHaveBeenCalledWith(tab)
    expect(worktree.status).toBe('archived')
    expect(tab.archivedByWorktree).toBe(true)
  })
})

describe('reconcile — worktree reappears reactivates its tabs (Bug #1 Fix B)', () => {
  it('un-archives the node and reactivates exactly the worktree-archived tabs', async () => {
    worktree.status = 'archived'
    tab.status = 'archived'
    tab.archivedByWorktree = true
    listWorktrees.mockResolvedValue(goodListing())
    await reconcileWorktrees()
    expect(worktree.status).toBe('idle')
    expect(reactivateTab).toHaveBeenCalledWith('t1')
    expect(tab.archivedByWorktree).toBe(false)
  })

  it('leaves user-closed tabs archived when the worktree reappears', async () => {
    worktree.status = 'archived'
    tab.status = 'archived'
    tab.archivedByWorktree = false // closed by the user, not by worktree-reconcile
    listWorktrees.mockResolvedValue(goodListing())
    await reconcileWorktrees()
    expect(worktree.status).toBe('idle')
    expect(reactivateTab).not.toHaveBeenCalled()
    expect(tab.status).toBe('archived')
  })
})
