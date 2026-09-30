import { describe, it, expect, afterEach } from 'vitest'
import {
  drainCounters,
  isCountersEnabled,
  noteIpcCall,
  noteTreeRebuild,
  setCountersEnabled
} from '@services/profiler/profiler.counters'

afterEach(() => {
  setCountersEnabled(false)
})

describe('profiler counters', () => {
  // The hooks sit in hot paths (every IPC call, every tree rebuild), so shipping
  // with them live would instrument every session by accident.
  it('is off until a session turns it on', () => {
    expect(isCountersEnabled()).toBe(false)

    noteIpcCall(5)
    noteTreeRebuild(3, 40)
    const counters = drainCounters()

    expect(counters.ipcCalls).toBe(0)
    expect(counters.rebuilds).toBe(0)
    expect(counters.treeRows).toBe(0)
  })

  it('accumulates counts and durations while enabled', () => {
    setCountersEnabled(true)
    noteIpcCall(4)
    noteIpcCall(6)
    noteTreeRebuild(1.5, 52)

    const counters = drainCounters()

    expect(counters.ipcCalls).toBe(2)
    expect(counters.ipcMs).toBe(10)
    expect(counters.rebuilds).toBe(1)
    expect(counters.rebuildMs).toBe(1.5)
    expect(counters.treeRows).toBe(52)
  })

  // Each sample records the interval since the previous one, so counts are deltas —
  // but the row count is a level and has to survive the reset, otherwise a sample
  // taken in a quiet interval would report a tree of size zero.
  it('drains counts as deltas and keeps the row count as a level', () => {
    setCountersEnabled(true)
    noteTreeRebuild(2, 48)
    drainCounters()

    const second = drainCounters()

    expect(second.rebuilds).toBe(0)
    expect(second.rebuildMs).toBe(0)
    expect(second.treeRows).toBe(48)
  })

  it('stops counting and clears the deltas when the session ends', () => {
    setCountersEnabled(true)
    noteIpcCall(9)
    setCountersEnabled(false)

    noteIpcCall(9)
    const counters = drainCounters()

    expect(isCountersEnabled()).toBe(false)
    expect(counters.ipcCalls).toBe(0)
    expect(counters.ipcMs).toBe(0)
  })
})
