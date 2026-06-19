import { describe, it, expect } from 'vitest'
import { newSummary, applyJsonlLine } from '@core/services/claude-usage.service'

// now = mid-month so monthStart << weekStart << dayStart and the three buckets
// are distinguishable.
const NOW = new Date(2026, 5, 15, 12, 0, 0)

function line(tsMs: number, usage: Record<string, number>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    timestamp: new Date(tsMs).toISOString(),
    message: { model: 'claude-test', usage: { speed: 'fast', ...usage }, ...extra }
  })
}

describe('claude-usage aggregation', () => {
  it('buckets a "today" line into today + week + month and flags it touched', () => {
    const { summary, bounds } = newSummary(NOW)
    const touched = applyJsonlLine(
      summary,
      line(bounds.dayStart + 3_600_000, {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 5,
        cache_read_input_tokens: 5
      }),
      bounds
    )
    expect(touched).toBe(true)
    expect(summary.today).toEqual({ inputTokens: 10, outputTokens: 20, cachedTokens: 10, totalTokens: 40 })
    expect(summary.thisWeek.totalTokens).toBe(40)
    expect(summary.thisMonth.totalTokens).toBe(40)
    expect(summary.lastModel).toBe('claude-test')
    expect(summary.lastSpeed).toBe('fast')
  })

  it('a this-month-but-not-today line counts toward month only and is not touched', () => {
    const { summary, bounds } = newSummary(NOW)
    const touched = applyJsonlLine(summary, line(bounds.monthStart + 3_600_000, { input_tokens: 100 }), bounds)
    expect(touched).toBe(false)
    expect(summary.thisMonth.totalTokens).toBe(100)
    expect(summary.today.totalTokens).toBe(0)
    expect(summary.thisWeek.totalTokens).toBe(0)
  })

  it('ignores lines before the month, and malformed JSON', () => {
    const { summary, bounds } = newSummary(NOW)
    expect(applyJsonlLine(summary, line(bounds.monthStart - 3_600_000, { input_tokens: 99 }), bounds)).toBe(false)
    expect(applyJsonlLine(summary, '{ not json', bounds)).toBe(false)
    expect(applyJsonlLine(summary, '', bounds)).toBe(false)
    expect(summary.thisMonth.totalTokens).toBe(0)
  })

  it('detects a thinking content block', () => {
    const { summary, bounds } = newSummary(NOW)
    applyJsonlLine(
      summary,
      line(bounds.dayStart + 1000, { input_tokens: 1 }, { content: [{ type: 'thinking' }] }),
      bounds
    )
    expect(summary.thinkingDetected).toBe(true)
  })

  it('resetTimes advance past now', () => {
    const { summary } = newSummary(NOW)
    expect(summary.resetTimes.day).toBeGreaterThan(NOW.getTime())
    expect(summary.resetTimes.week).toBeGreaterThan(NOW.getTime())
    expect(summary.resetTimes.month).toBeGreaterThan(NOW.getTime())
  })
})
