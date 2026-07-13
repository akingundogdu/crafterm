import { describe, it, expect } from 'vitest'
import { fmtResetTime, usageErrorShort, usageErrorLong } from '@services/domain/usage'

describe('usage error strings', () => {
  it('short labels', () => {
    expect(usageErrorShort('no-token')).toBe('no token')
    expect(usageErrorShort('auth-expired')).toBe('auth expired')
    expect(usageErrorShort('network')).toBe('unavailable')
  })

  it('long messages differ per error', () => {
    expect(usageErrorLong('no-token')).toMatch(/no Claude OAuth token/i)
    expect(usageErrorLong('auth-expired')).toMatch(/expired/i)
    expect(usageErrorLong('unavailable')).toMatch(/could not reach/i)
  })
})

describe('fmtResetTime', () => {
  const now = new Date(2026, 5, 15, 9, 0, 0).getTime()

  it('prefixes Today for same-day resets', () => {
    const reset = new Date(2026, 5, 15, 14, 30, 0).getTime()
    expect(fmtResetTime(reset, now)).toMatch(/^Today /)
  })

  it('prefixes Tomorrow for next-day resets', () => {
    const reset = new Date(2026, 5, 16, 3, 0, 0).getTime()
    expect(fmtResetTime(reset, now)).toMatch(/^Tomorrow /)
  })

  it('uses a month/day label further out', () => {
    const reset = new Date(2026, 5, 20, 3, 0, 0).getTime()
    const s = fmtResetTime(reset, now)
    expect(s).not.toMatch(/^Today /)
    expect(s).not.toMatch(/^Tomorrow /)
  })
})
