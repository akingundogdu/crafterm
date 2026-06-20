import { describe, it, expect } from 'vitest'
import {
  fmtClock,
  fmtHM,
  startOfToday,
  rangeStart,
  sumByProject,
  reportByProject,
  type Range
} from '@services/domain/time'
import type { TimeEntry } from '@ui/types/types'

const entry = (p: Partial<TimeEntry> & { start: number; end: number }): TimeEntry => ({
  id: 'e',
  projectPath: 'a',
  source: 'manual',
  ...p
})

describe('time formatting', () => {
  it('fmtClock zero-pads h:m:s', () => {
    expect(fmtClock(0)).toBe('00:00:00')
    expect(fmtClock(3_661_000)).toBe('01:01:01')
  })

  it('fmtHM switches to h+m past an hour', () => {
    expect(fmtHM(0)).toBe('0m')
    expect(fmtHM(59 * 60_000)).toBe('59m')
    expect(fmtHM(90 * 60_000)).toBe('1h 30m')
  })
})

describe('range boundaries', () => {
  const now = new Date(2026, 5, 15, 13, 30, 0).getTime() // 2026-06-15 13:30 local

  it('startOfToday is local midnight', () => {
    expect(startOfToday(now)).toBe(new Date(2026, 5, 15, 0, 0, 0, 0).getTime())
  })

  it('rangeStart respects each window', () => {
    expect(rangeStart('today', now)).toBe(new Date(2026, 5, 15, 0, 0, 0, 0).getTime())
    expect(rangeStart('week', now)).toBe(new Date(2026, 5, 9, 0, 0, 0, 0).getTime())
    expect(rangeStart('month', now)).toBe(new Date(2026, 4, 17, 0, 0, 0, 0).getTime())
    expect(rangeStart('all', now)).toBe(0)
  })
})

describe('aggregation', () => {
  const entries: TimeEntry[] = [
    entry({ projectPath: 'a', start: 100, end: 300 }), // 200
    entry({ projectPath: 'a', start: 400, end: 500, featureId: 'f1' }), // 100
    entry({ projectPath: 'b', start: 0, end: 50 }), // before cutoff
    entry({ projectPath: 'b', start: 1000, end: 1600, featureId: 'f2' }) // 600
  ]

  it('sumByProject sums entries at/after cutoff plus ongoing spans', () => {
    const m = sumByProject(entries, 100, [{ projectPath: 'a', ms: 1000 }])
    expect(m.get('a')).toBe(200 + 100 + 1000)
    expect(m.get('b')).toBe(600) // the end<100 entry is excluded
  })

  it('reportByProject breaks down by feature (no-feature key is "")', () => {
    const r = reportByProject(entries, 100)
    expect(r.get('a')?.total).toBe(300)
    expect(r.get('a')?.feats.get('')).toBe(200)
    expect(r.get('a')?.feats.get('f1')).toBe(100)
    expect(r.get('b')?.total).toBe(600)
    expect(r.get('b')?.feats.get('f2')).toBe(600)
  })

  it('all-time range keeps everything', () => {
    const r = reportByProject(entries, rangeStart('all' as Range, 0))
    expect(r.get('b')?.total).toBe(50 + 600)
  })
})
