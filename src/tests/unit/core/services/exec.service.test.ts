import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'child_process'
import { hydrateEnvPath } from '../../../../core/services/exec/exec.service'

const GUI_PATH = '/usr/bin:/bin:/usr/sbin:/sbin'
const original = process.env.PATH

afterEach(() => {
  process.env.PATH = original
})

// Drives the real login shell — this is the behaviour the fix exists for, and a
// mock of it would prove nothing about whether the app can find git-lfs.
describe('hydrateEnvPath', () => {
  it('recovers the user PATH from the bare one a GUI launch inherits', () => {
    process.env.PATH = GUI_PATH
    hydrateEnvPath()
    const entries = (process.env.PATH ?? '').split(':')
    expect(entries.length).toBeGreaterThan(GUI_PATH.split(':').length)
    for (const systemEntry of GUI_PATH.split(':')) expect(entries).toContain(systemEntry)
  })

  it('makes a Homebrew-installed CLI spawnable by bare name', () => {
    const installed = (() => {
      try {
        execFileSync('/opt/homebrew/bin/git-lfs', ['version'], { stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    })()
    if (!installed) return

    process.env.PATH = GUI_PATH
    expect(() => execFileSync('git-lfs', ['version'], { stdio: 'ignore' })).toThrow()
    hydrateEnvPath()
    expect(() => execFileSync('git-lfs', ['version'], { stdio: 'ignore' })).not.toThrow()
  })

  it('leaves a PATH inherited from a shell untouched', () => {
    const shellPath = '/opt/homebrew/bin:' + GUI_PATH
    process.env.PATH = shellPath
    hydrateEnvPath()
    expect(process.env.PATH).toBe(shellPath)
  })
})
