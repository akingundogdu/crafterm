import { describe, it, expect } from 'vitest'
import { relTime, pathTail, shortModel } from './notif-format'

describe('relTime', () => {
  const now = 1_000_000_000_000
  it('says "just now" under a minute', () => {
    expect(relTime(now - 30_000, now)).toBe('just now')
  })
  it('formats minutes, hours, and days', () => {
    expect(relTime(now - 5 * 60_000, now)).toBe('5m ago')
    expect(relTime(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(relTime(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
  it('never goes negative for future timestamps', () => {
    expect(relTime(now + 60_000, now)).toBe('just now')
  })
})

describe('pathTail', () => {
  it('keeps the last n segments with an ellipsis prefix when trimmed', () => {
    expect(pathTail('/a/b/c/d/e')).toBe('…/c/d/e')
    expect(pathTail('/a/b/c/d/e', 2)).toBe('…/d/e')
  })
  it('returns the original path when short enough', () => {
    expect(pathTail('/a/b')).toBe('/a/b')
  })
  it('ignores a trailing slash', () => {
    expect(pathTail('/a/b/c/d/')).toBe('…/b/c/d')
  })
})

describe('shortModel', () => {
  it('strips the claude- prefix and dots the version', () => {
    expect(shortModel('claude-opus-4-8')).toBe('opus-4.8')
    expect(shortModel('claude-sonnet-4-6')).toBe('sonnet-4.6')
  })
  it('drops a trailing date suffix', () => {
    expect(shortModel('claude-haiku-4-5-20251001')).toBe('haiku-4.5')
  })
  it('returns empty for null', () => {
    expect(shortModel(null)).toBe('')
  })
})
