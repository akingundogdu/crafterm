import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode } from '@views/types/types'

const listWorktrees = vi.fn()
const worktreeAdd = vi.fn()

vi.mock('@services', () => ({
  gitService: {
    listWorktrees: (repo: string) => listWorktrees(repo),
    worktreeAdd: (repo: string, path: string, branch: string, base?: string) =>
      worktreeAdd(repo, path, branch, base)
  },
  appService: {},
  soundService: {}
}))
// The sidebar already carries the worktree node, so the materialize poll resolves on
// its first look instead of spinning for its 3s deadline.
const tree: unknown[] = [
  { kind: 'worktree', id: 'w1', worktreePath: '/repos/worktrees/CRF-1', children: [] }
]

vi.mock('@views/state/state', () => ({
  state: { tree },
  settings: {},
  requestSidebar: () => {},
  uid: (p: string) => p + '-1',
  pushNotification: () => {}
}))
vi.mock('@repositories/persistence.service', () => ({ persistence: { save: () => {} } }))
vi.mock('@views/tree/tree', () => ({ makeFolder: () => ({}), allTabs: () => [], projectOf: () => null }))
vi.mock('@views/catalog/catalog', () => ({ flattenProjects: () => [] }))
vi.mock('@views/commands/commands', () => ({ archiveTab: () => {} }))
vi.mock('@services/bgproc', () => ({ runHiddenAndWait: async () => ({}), removeProcess: () => {} }))
vi.mock('@views/components/dialog/prompt-form', () => ({ promptForm: async () => null }))
vi.mock('@views/components/dialog/confirm', () => ({ promptConfirm: async () => false }))

const { ensureWorktreeForBranch } = await import('@services/worktrees')

function project(name: string, path: string): ProjectNode {
  return { kind: 'project', id: 'p1', name, path, children: [] } as unknown as ProjectNode
}

describe('ensureWorktreeForBranch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listWorktrees.mockResolvedValue({ worktrees: [] })
    worktreeAdd.mockResolvedValue({ ok: true })
  })

  it('creates the worktree off the given base and reports each step', async () => {
    const stages: string[] = []

    const result = await ensureWorktreeForBranch(project('alpha', '/repos/alpha'), 'CRF-1', 'develop', (s) =>
      stages.push(s)
    )

    expect(worktreeAdd).toHaveBeenCalledWith('/repos/alpha', '/repos/worktrees/CRF-1', 'CRF-1', 'develop')
    expect(result).toMatchObject({ ok: true, path: '/repos/worktrees/CRF-1', nodeId: 'w1' })
    expect(stages).toEqual(['looking', 'creating', 'materializing'])
  })

  it('reuses an existing worktree without calling git again', async () => {
    listWorktrees.mockResolvedValue({ worktrees: [{ path: '/repos/worktrees/CRF-1' }] })
    const stages: string[] = []

    const result = await ensureWorktreeForBranch(project('alpha', '/repos/alpha'), 'CRF-1', 'main', (s) =>
      stages.push(s)
    )

    expect(worktreeAdd).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    expect(stages).toEqual(['looking', 'materializing'])
  })

  it("hands git's own error back when the worktree cannot be created", async () => {
    worktreeAdd.mockResolvedValue({ ok: false, error: "fatal: 'CRF-1' is already checked out" })

    const result = await ensureWorktreeForBranch(project('alpha', '/repos/alpha'), 'CRF-1')

    expect(result).toEqual({ ok: false, error: "fatal: 'CRF-1' is already checked out" })
  })

  it('fails with a message when the project has no path', async () => {
    const result = await ensureWorktreeForBranch(project('alpha', ''), 'CRF-1')

    expect(result.ok).toBe(false)
    expect(worktreeAdd).not.toHaveBeenCalled()
  })
})
