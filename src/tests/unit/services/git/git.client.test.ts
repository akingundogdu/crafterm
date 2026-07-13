// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gitService } from '@services/git/git.client'

describe('gitService (channel wrapper)', () => {
  beforeEach(() => {
    ;(window as unknown as { crafterm: { invoke: ReturnType<typeof vi.fn> } }).crafterm = {
      invoke: vi.fn().mockResolvedValue(['main', 'dev'])
    } as never
  })

  it('routes branches to the git:branches channel with a shaped payload', async () => {
    const res = await gitService.branches('pane1')
    expect(window.crafterm.invoke).toHaveBeenCalledWith('git:branches', { id: 'pane1' })
    expect(res).toEqual(['main', 'dev'])
  })

  it('shapes multi-arg calls into the registry payload (worktreeAdd)', async () => {
    await gitService.worktreeAdd('/repo', '/wt', 'feat', 'main')
    expect(window.crafterm.invoke).toHaveBeenCalledWith('git:worktreeAdd', {
      repo: '/repo',
      path: '/wt',
      branch: 'feat',
      base: 'main'
    })
  })

  it('is lazy — importing did not require window.crafterm to exist', () => {
    expect(typeof gitService.branches).toBe('function')
  })
})
