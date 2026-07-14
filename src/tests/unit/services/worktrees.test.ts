import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectNode } from '@views/types/types'

const listWorktrees = vi.fn()
const worktreeAdd = vi.fn()
const worktreeState = vi.fn()
const promptConfirm = vi.fn()
const runHiddenAndWait = vi.fn()
const procBuffer = vi.fn()
const progressSetStep = vi.fn()
const progressFail = vi.fn()
const progressClose = vi.fn()

vi.mock('@services', () => ({
  gitService: {
    listWorktrees: (repo: string) => listWorktrees(repo),
    worktreeState: (cwd: string) => worktreeState(cwd),
    worktreeAdd: (repo: string, path: string, branch: string, base?: string) =>
      worktreeAdd(repo, path, branch, base)
  },
  terminalService: { procBuffer: (id: string) => procBuffer(id) },
  appService: {},
  soundService: { play: () => {} }
}))
vi.mock('@views/components/worktree-progress/worktree-progress', () => ({
  showWorktreeProgress: () => ({
    setStep: (s: string) => progressSetStep(s),
    fail: (e: string) => {
      progressFail(e)
      return Promise.resolve()
    },
    close: () => progressClose()
  })
}))
vi.mock('@views/components/worktree-progress/worktree-progress.store', () => ({ REMOVE_STEPS: [] }))
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
vi.mock('@services/bgproc', () => ({
  runHiddenAndWait: (...args: unknown[]) => runHiddenAndWait(...args),
  removeProcess: () => {}
}))
vi.mock('@views/components/dialog/prompt-form', () => ({ promptForm: async () => null }))
vi.mock('@views/components/dialog/confirm', () => ({
  promptConfirm: (opts: unknown) => promptConfirm(opts)
}))

const { ensureWorktreeForBranch, removeWorktree } = await import('@services/worktrees')

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

describe('removeWorktree pre-checks (todomrkkvspyax)', () => {
  const clean = { branch: 'CRF-1', changed: 0, untracked: 0, ahead: 0, hasUpstream: true }

  beforeEach(() => {
    vi.clearAllMocks()
    worktreeState.mockResolvedValue(clean)
    promptConfirm.mockResolvedValue(true)
    runHiddenAndWait.mockResolvedValue({ stableId: 's1', code: 0 })
    procBuffer.mockResolvedValue('')
  })

  it('checks the worktree before touching it, and removes a clean one plainly', async () => {
    const ok = await removeWorktree(project('alpha', '/repos/alpha'), '/repos/worktrees/CRF-1')

    expect(worktreeState).toHaveBeenCalledWith('/repos/worktrees/CRF-1')
    expect(progressSetStep.mock.calls.map((c) => c[0])).toEqual(['checking', 'removing', 'cleaning'])
    expect(runHiddenAndWait.mock.calls[0][1].command).not.toContain('--force')
    expect(ok).toBe(true)
  })

  it('spells out what would be lost and forces the removal when the tree is dirty', async () => {
    worktreeState.mockResolvedValue({ branch: 'CRF-1', changed: 2, untracked: 1, ahead: 3, hasUpstream: true })

    await removeWorktree(project('alpha', '/repos/alpha'), '/repos/worktrees/CRF-1')

    const message = promptConfirm.mock.calls[0][0].message as string
    expect(message).toContain('2 uncommitted changes')
    expect(message).toContain('1 untracked file')
    expect(message).toContain('3 commits not pushed')
    expect(runHiddenAndWait.mock.calls[0][1].command).toContain('--force')
  })

  it('does nothing when the warning is declined', async () => {
    worktreeState.mockResolvedValue({ ...clean, changed: 1 })
    promptConfirm.mockResolvedValue(false)

    const ok = await removeWorktree(project('alpha', '/repos/alpha'), '/repos/worktrees/CRF-1')

    expect(runHiddenAndWait).not.toHaveBeenCalled()
    expect(ok).toBe(false)
  })

  it("shows git's own output when the removal fails", async () => {
    runHiddenAndWait.mockResolvedValue({ stableId: 's1', code: 1 })
    procBuffer.mockResolvedValue("fatal: '/repos/worktrees/CRF-1' contains modified files\n")

    const ok = await removeWorktree(project('alpha', '/repos/alpha'), '/repos/worktrees/CRF-1')

    expect(progressFail).toHaveBeenCalledWith("fatal: '/repos/worktrees/CRF-1' contains modified files")
    expect(ok).toBe(false)
  })
})
