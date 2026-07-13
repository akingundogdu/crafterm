import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock only fs.watch (capture the change callback); keep real read/write so the
// counter file genuinely round-trips on a temp dir.
let changeCb: ((evt: string, filename: string) => void) | null = null
const fakeWatcher = { on: vi.fn(), close: vi.fn() }
const watchMock = vi.fn((_dir: string, _opts: unknown, cb: (e: string, f: string) => void) => {
  changeCb = cb
  return fakeWatcher
})
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, watch: (...a: unknown[]) => (watchMock as (...x: unknown[]) => unknown)(...a) }
})

import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as buildCounter from '@core/services/build-counter/build-counter.service'

let dir: string
let file: string
const REPO = '/some/repo'

beforeEach(() => {
  vi.useFakeTimers()
  changeCb = null
  watchMock.mockClear()
  fakeWatcher.on.mockClear()
  fakeWatcher.close.mockClear()
  dir = mkdtempSync(join(tmpdir(), 'bc-test-'))
  file = join(dir, 'build-counter.json')
})

afterEach(() => {
  buildCounter.closeAll()
  vi.useRealTimers()
  rmSync(dir, { recursive: true, force: true })
})

describe('build-counter.service', () => {
  it('isIgnoredBuildPath flags build/dep/git segments only', () => {
    expect(buildCounter.isIgnoredBuildPath('node_modules/x/y.js')).toBe(true)
    expect(buildCounter.isIgnoredBuildPath('.git/HEAD')).toBe(true)
    expect(buildCounter.isIgnoredBuildPath('out/main/index.js')).toBe(true)
    expect(buildCounter.isIgnoredBuildPath('src/app.ts')).toBe(false)
  })

  it('getCount starts a watcher (once) and returns 0 before any save', () => {
    expect(buildCounter.getCount(REPO, file)).toBe(0)
    expect(watchMock).toHaveBeenCalledTimes(1)
    buildCounter.getCount(REPO, file) // idempotent watcher
    expect(watchMock).toHaveBeenCalledTimes(1)
  })

  it('a non-ignored save bumps the persisted count (debounced)', () => {
    buildCounter.getCount(REPO, file)
    changeCb?.('change', 'src/app.ts')
    changeCb?.('change', 'src/app.ts') // collapses to +1
    expect(existsSync(file)).toBe(false) // nothing written yet (within debounce)
    vi.advanceTimersByTime(300)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ [REPO]: 1 })
    expect(buildCounter.getCount(REPO, file)).toBe(1)
  })

  it('ignored paths never bump the counter', () => {
    buildCounter.getCount(REPO, file)
    changeCb?.('change', 'node_modules/dep/index.js')
    vi.advanceTimersByTime(300)
    expect(existsSync(file)).toBe(false)
  })

  it('readCounters tolerates a missing/garbage file', () => {
    expect(buildCounter.readCounters(file)).toEqual({})
  })
})
