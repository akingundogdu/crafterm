import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const h = vi.hoisted(() => ({ packaged: true, appVersion: '1.2.3' }))
vi.mock('electron', () => ({
  app: {
    getVersion: () => h.appVersion,
    get isPackaged() {
      return h.packaged
    }
  }
}))

const runMock = vi.fn<(cmd: string, args: string[]) => Promise<string | null>>()
vi.mock('@core/services/exec/exec.service', () => ({
  run: (cmd: string, args: string[]) => runMock(cmd, args),
  gitBin: () => 'git'
}))

import * as appInfo from '@core/services/app-info/app-info.service'

let dir: string
beforeEach(() => {
  h.packaged = true
  h.appVersion = '1.2.3'
  runMock.mockReset()
  dir = mkdtempSync(join(tmpdir(), 'app-info-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('app-info.service.version', () => {
  it('returns the electron app version', () => {
    h.appVersion = '9.9.9'
    expect(appInfo.version()).toBe('9.9.9')
  })
})

describe('app-info.service.buildInfo', () => {
  it('returns null when unpackaged (dev)', () => {
    h.packaged = false
    expect(appInfo.buildInfo(join(dir, 'build-info.json'))).toBeNull()
  })

  it('parses commit + commitCount from the bundled file when packaged', () => {
    const f = join(dir, 'build-info.json')
    writeFileSync(f, JSON.stringify({ commit: 'deadbeef', commitCount: 128 }))
    expect(appInfo.buildInfo(f)).toEqual({ commit: 'deadbeef', commitCount: 128 })
  })

  it('coerces missing/wrong-typed fields to null, and returns null on a missing file', () => {
    const f = join(dir, 'partial.json')
    writeFileSync(f, JSON.stringify({ commit: 42 }))
    expect(appInfo.buildInfo(f)).toEqual({ commit: null, commitCount: null })
    expect(appInfo.buildInfo(join(dir, 'nope.json'))).toBeNull()
  })
})

describe('app-info.service.repoGit', () => {
  it('returns null for an empty/nonexistent repo path', async () => {
    expect(await appInfo.repoGit(undefined)).toBeNull()
    expect(await appInfo.repoGit('/definitely/not/here')).toBeNull()
  })

  it('reports commit, count, and dirty state for a real path', async () => {
    runMock.mockImplementation((_cmd, args) => {
      if (args.includes('rev-parse')) return Promise.resolve('abc123\n')
      if (args.includes('rev-list')) return Promise.resolve('42\n')
      if (args.includes('status')) return Promise.resolve(' M src/app.ts\n')
      return Promise.resolve(null)
    })
    expect(await appInfo.repoGit(dir)).toEqual({ commit: 'abc123', commitCount: 42, dirty: true })
  })

  it('is clean when status is empty, null when HEAD cannot be read', async () => {
    runMock.mockImplementation((_cmd, args) => {
      if (args.includes('rev-parse')) return Promise.resolve('abc123\n')
      if (args.includes('rev-list')) return Promise.resolve('1\n')
      if (args.includes('status')) return Promise.resolve('')
      return Promise.resolve(null)
    })
    expect(await appInfo.repoGit(dir)).toEqual({ commit: 'abc123', commitCount: 1, dirty: false })

    runMock.mockResolvedValue(null)
    expect(await appInfo.repoGit(dir)).toBeNull()
  })
})
