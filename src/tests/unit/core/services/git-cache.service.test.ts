import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// The cache exists to avoid spawning git; the test proves it actually skips the
// git calls when HEAD has not moved, and re-runs them when it has. git.service is
// mocked so a call is observable as a mock invocation, and real .git/HEAD files on
// disk drive the mtime-based invalidation.
const currentBranch = vi.fn<(cwd: string) => Promise<string | null>>()
const worktreeName = vi.fn<(cwd: string) => Promise<string | null>>()
vi.mock('@core/services/git/git.service', () => ({
  currentBranch: (cwd: string) => currentBranch(cwd),
  worktreeName: (cwd: string) => worktreeName(cwd)
}))

import { facts, clearGitCache } from '@core/services/git/git-cache.service'

let root = ''

function makeRepo(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'crafterm-gitcache-'))
  mkdirSync(join(cwd, '.git'))
  writeFileSync(join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  return cwd
}

beforeEach(() => {
  clearGitCache()
  currentBranch.mockReset().mockResolvedValue('main')
  worktreeName.mockReset().mockResolvedValue(null)
  root = ''
})

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true })
})

describe('git-cache facts', () => {
  it('spawns git on the first lookup and serves the second from cache', async () => {
    root = makeRepo()

    const first = await facts(root)
    const second = await facts(root)

    expect(first).toEqual({ branch: 'main', worktree: null })
    expect(second).toEqual({ branch: 'main', worktree: null })
    expect(currentBranch).toHaveBeenCalledTimes(1) // second served from cache
    expect(worktreeName).toHaveBeenCalledTimes(1)
  })

  it('re-runs git when HEAD is touched (a branch switch outside the pane)', async () => {
    root = makeRepo()
    await facts(root)

    // Simulate `git checkout` elsewhere: HEAD's mtime advances.
    const later = new Date(Date.now() + 5000)
    utimesSync(join(root, '.git', 'HEAD'), later, later)
    currentBranch.mockResolvedValue('feature/x')

    const after = await facts(root)

    expect(after.branch).toBe('feature/x')
    expect(currentBranch).toHaveBeenCalledTimes(2) // invalidated, refetched
  })

  it('never spawns git for a non-repo cwd (the per-tick storm fix)', async () => {
    root = mkdtempSync(join(tmpdir(), 'crafterm-norepo2-'))

    const a = await facts(root)
    const b = await facts(root)

    // No HEAD to key on → return null WITHOUT running git, every time. The earlier
    // version spawned currentBranch+worktreeName per call for a guaranteed-null
    // result, which is exactly the fan-out this cache exists to remove.
    expect(a).toEqual({ branch: null, worktree: null })
    expect(b).toEqual({ branch: null, worktree: null })
    expect(currentBranch).not.toHaveBeenCalled()
    expect(worktreeName).not.toHaveBeenCalled()
  })

  it('picks up a git init that turns a non-repo cwd into a repo', async () => {
    root = mkdtempSync(join(tmpdir(), 'crafterm-init-'))
    await facts(root) // non-repo: no git
    expect(currentBranch).not.toHaveBeenCalled()

    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
    const after = await facts(root)

    expect(after.branch).toBe('main') // HEAD now resolves → git runs
    expect(currentBranch).toHaveBeenCalledTimes(1)
  })

})
