import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture the fs.watch change callback so we can trigger "directory changed"
// deterministically, and stub electron windows to observe broadcasts.
let changeCb: (() => void) | null = null
const fakeWatcher = { on: vi.fn(), close: vi.fn() }
const watchMock = vi.fn((_dir: string, _opts: unknown, cb: () => void) => {
  changeCb = cb
  return fakeWatcher
})

vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  watch: (dir: string, opts: unknown, cb: () => void) => watchMock(dir, opts, cb)
}))

const send = vi.fn()
const fakeWindow = {
  isDestroyed: () => false,
  webContents: { isDestroyed: () => false, send }
}
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [fakeWindow] }
}))

import * as plansWatcher from '@core/services/plans.watcher'

beforeEach(() => {
  vi.useFakeTimers()
  changeCb = null
  watchMock.mockClear()
  fakeWatcher.on.mockClear()
  fakeWatcher.close.mockClear()
  send.mockClear()
})

afterEach(() => {
  plansWatcher.closeAll()
  vi.useRealTimers()
})

describe('plans.watcher', () => {
  it('creates one watcher per dir and is idempotent', () => {
    plansWatcher.ensure('/repo/docs/plans')
    plansWatcher.ensure('/repo/docs/plans')
    expect(watchMock).toHaveBeenCalledTimes(1)
  })

  it('debounces change events into a single broadcast', () => {
    plansWatcher.ensure('/repo/docs/plans')
    // two rapid events
    changeCb?.()
    changeCb?.()
    expect(send).not.toHaveBeenCalled() // still within debounce window
    vi.advanceTimersByTime(150)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('plans:changed', { plansDir: '/repo/docs/plans' })
  })

  it('closeAll closes watchers and lets ensure re-create afterwards', () => {
    plansWatcher.ensure('/repo/docs/plans')
    plansWatcher.closeAll()
    expect(fakeWatcher.close).toHaveBeenCalled()

    plansWatcher.ensure('/repo/docs/plans')
    expect(watchMock).toHaveBeenCalledTimes(2) // re-created after close
  })

  it('cancels a pending broadcast on closeAll (no late send)', () => {
    plansWatcher.ensure('/repo/docs/plans')
    changeCb?.()
    plansWatcher.closeAll()
    vi.advanceTimersByTime(500)
    expect(send).not.toHaveBeenCalled()
  })
})
