import { describe, it, expect } from 'vitest'
import { boardColumnOf, ymd, parseYmd, shiftDays } from './task-helpers'

describe('boardColumnOf', () => {
  it('folds review and test into the wip column', () => {
    expect(boardColumnOf('review')).toBe('wip')
    expect(boardColumnOf('test')).toBe('wip')
  })
  it('maps every other status to its own column', () => {
    expect(boardColumnOf('backlog')).toBe('backlog')
    expect(boardColumnOf('todo')).toBe('todo')
    expect(boardColumnOf('wip')).toBe('wip')
    expect(boardColumnOf('done')).toBe('done')
  })
})

describe('ymd / parseYmd', () => {
  it('formats a date as zero-padded YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(ymd(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
  it('round-trips through parseYmd', () => {
    expect(ymd(parseYmd('2026-06-17'))).toBe('2026-06-17')
  })
  it('parseYmd builds a local date at the given day', () => {
    const d = parseYmd('2026-06-17')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 17])
  })
})

describe('shiftDays', () => {
  it('moves forward and backward across month boundaries', () => {
    expect(shiftDays('2026-06-17', 1)).toBe('2026-06-18')
    expect(shiftDays('2026-06-17', -1)).toBe('2026-06-16')
    expect(shiftDays('2026-06-30', 1)).toBe('2026-07-01')
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31')
  })
  it('is a no-op for a zero delta', () => {
    expect(shiftDays('2026-06-17', 0)).toBe('2026-06-17')
  })
})
