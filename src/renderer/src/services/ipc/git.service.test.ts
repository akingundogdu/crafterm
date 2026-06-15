// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gitService } from './git.service'

describe('gitService (ipc wrapper)', () => {
  beforeEach(() => {
    ;(window as unknown as { crafterm: Record<string, unknown> }).crafterm = {
      gitBranches: vi.fn().mockResolvedValue(['main', 'dev']),
      worktreeAdd: vi.fn().mockResolvedValue(true)
    }
  })

  it('delegates to window.crafterm.gitBranches with the same args', async () => {
    const res = await gitService.branches('pane1')
    expect(window.crafterm.gitBranches).toHaveBeenCalledWith('pane1')
    expect(res).toEqual(['main', 'dev'])
  })

  it('forwards multiple args (worktreeAdd)', async () => {
    await gitService.worktreeAdd('/repo', '/wt', 'feat', 'main')
    expect(window.crafterm.worktreeAdd).toHaveBeenCalledWith('/repo', '/wt', 'feat', 'main')
  })

  it('is lazy — importing did not require window.crafterm to exist', () => {
    expect(typeof gitService.branches).toBe('function')
  })
})
