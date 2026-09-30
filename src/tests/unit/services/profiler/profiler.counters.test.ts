import { describe, it, expect, afterEach } from 'vitest'
import {
  drainCounters,
  drainSections,
  drainSlowCalls,
  isCountersEnabled,
  noteIpcCall,
  noteTreeRebuild,
  sectionEnd,
  sectionStart,
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

  // The instrumented chokepoints are what name the culprit inside a long task, so
  // the gate matters as much here: `term.write` runs once per PTY chunk.
  it('times nothing while disabled, using 0 as the not-timing sentinel', () => {
    expect(sectionStart()).toBe(0)

    sectionEnd('persist', 0)
    expect(drainSections()).toEqual([])
    expect(drainSlowCalls()).toEqual([])
  })

  it('aggregates calls, total and max per label while enabled', () => {
    setCountersEnabled(true)
    const started = sectionStart()
    expect(started).toBeGreaterThan(0)

    sectionEnd('persist', performance.now() - 10)
    sectionEnd('persist', performance.now() - 4)
    sectionEnd('term.write', performance.now() - 1)

    const sections = drainSections()
    const persist = sections.find((entry) => entry.label === 'persist')
    expect(persist?.totals.calls).toBe(2)
    expect(persist?.totals.maxMs).toBeGreaterThanOrEqual(10)
    expect(persist?.totals.ms).toBeGreaterThanOrEqual(14)
    expect(sections.find((entry) => entry.label === 'term.write')?.totals.calls).toBe(1)
    expect(drainSections()).toEqual([]) // drained
  })

  // A fast call is only counted; a slow one also gets its own line, because that is
  // the record that names what was inside the freeze.
  it('logs only calls over the slow threshold individually', () => {
    setCountersEnabled(true)
    sectionEnd('fast', performance.now() - 5)
    sectionEnd('slow', performance.now() - 120)

    const slow = drainSlowCalls()

    expect(slow).toHaveLength(1)
    expect(slow[0].label).toBe('slow')
    expect(slow[0].ms).toBeGreaterThanOrEqual(120)
    expect(drainSlowCalls()).toEqual([]) // drained
  })

  it('clears sections and slow calls when the session ends', () => {
    setCountersEnabled(true)
    sectionEnd('persist', performance.now() - 200)
    setCountersEnabled(false)

    expect(drainSections()).toEqual([])
    expect(drainSlowCalls()).toEqual([])
  })
})
