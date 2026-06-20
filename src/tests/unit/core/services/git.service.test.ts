import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the exec layer so the parse logic is tested against canned git output,
// with no real git/lsof process. `run` is dispatched per-test by inspecting args.
const runMock = vi.fn<(cmd: string, args: string[]) => Promise<string | null>>()
vi.mock('@core/services/exec/exec.service', () => ({
  run: (cmd: string, args: string[]) => runMock(cmd, args),
  gitBin: () => 'git'
}))

import * as git from '@core/services/git/git.service'

beforeEach(() => {
  runMock.mockReset()
})

describe('git.service.currentBranch', () => {
  it('returns the branch name', async () => {
    runMock.mockResolvedValue('feature/x\n')
    expect(await git.currentBranch('/repo')).toBe('feature/x')
  })
  it('returns null on detached HEAD or no output', async () => {
    runMock.mockResolvedValueOnce('HEAD\n')
    expect(await git.currentBranch('/repo')).toBeNull()
    runMock.mockResolvedValueOnce(null)
    expect(await git.currentBranch('/repo')).toBeNull()
  })
})

describe('git.service.worktreeName', () => {
  it('returns the toplevel basename only inside a linked worktree', async () => {
    runMock.mockImplementation((_cmd, args) => {
      if (args.includes('--absolute-git-dir')) return Promise.resolve('/main/.git/worktrees/wt\n')
      if (args.includes('--show-toplevel')) return Promise.resolve('/checkouts/wt\n')
      return Promise.resolve(null)
    })
    expect(await git.worktreeName('/checkouts/wt')).toBe('wt')
  })
  it('returns null in the main checkout (git dir not under /worktrees/)', async () => {
    runMock.mockResolvedValue('/main/.git\n')
    expect(await git.worktreeName('/main')).toBeNull()
  })
})

describe('git.service.branches', () => {
  it('splits and trims branch lines', async () => {
    runMock.mockResolvedValue('main\nfeature/x\n\n  dev  \n')
    expect(await git.branches('/repo')).toEqual(['main', 'feature/x', 'dev'])
  })
  it('returns [] on no output', async () => {
    runMock.mockResolvedValue(null)
    expect(await git.branches('/repo')).toEqual([])
  })
})

describe('git.service.stashList', () => {
  it('parses ref + description split on NUL', async () => {
    runMock.mockResolvedValue('stash@{0}\x00WIP on main\nstash@{1}\x00quick fix\n')
    expect(await git.stashList('/repo')).toEqual([
      { ref: 'stash@{0}', description: 'WIP on main' },
      { ref: 'stash@{1}', description: 'quick fix' }
    ])
  })
})

describe('git.service.fileStatus', () => {
  it('maps porcelain codes to kinds against the repo root, handling renames', async () => {
    runMock.mockImplementation((_cmd, args) => {
      if (args.includes('--show-toplevel')) return Promise.resolve('/root\n')
      if (args.includes('status'))
        return Promise.resolve(' M mod.ts\n?? new.ts\nA  added.ts\n D gone.ts\nR  old.ts -> renamed.ts\n')
      return Promise.resolve(null)
    })
    expect(await git.fileStatus('/root/sub')).toEqual({
      '/root/mod.ts': 'modified',
      '/root/new.ts': 'untracked',
      '/root/added.ts': 'added',
      '/root/gone.ts': 'deleted',
      '/root/renamed.ts': 'renamed'
    })
  })
  it('returns {} when cwd is missing or not a repo', async () => {
    expect(await git.fileStatus(undefined)).toEqual({})
    runMock.mockResolvedValue(null)
    expect(await git.fileStatus('/not/a/repo')).toEqual({})
  })
})

describe('git.service.listWorktrees', () => {
  it('parses the porcelain worktree list', async () => {
    runMock.mockImplementation((_cmd, args) => {
      if (args.includes('--show-toplevel')) return Promise.resolve('/root\n')
      if (args.includes('list'))
        return Promise.resolve(
          'worktree /root\nbranch refs/heads/main\n\nworktree /wt/feature\nbranch refs/heads/feature\n\nworktree /wt/detached\ndetached\n\n'
        )
      return Promise.resolve(null)
    })
    const res = await git.listWorktrees('/root')
    expect(res.root).toBe('/root')
    expect(res.worktrees).toEqual([
      { path: '/root', branch: 'main' },
      { path: '/wt/feature', branch: 'feature' },
      { path: '/wt/detached', branch: '(detached)' }
    ])
  })
  it('returns an empty list outside a repo', async () => {
    runMock.mockResolvedValue(null)
    expect(await git.listWorktrees('/tmp')).toEqual({ root: null, worktrees: [] })
  })
})
