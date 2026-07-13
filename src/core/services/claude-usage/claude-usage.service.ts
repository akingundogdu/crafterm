// Pure Claude token-usage aggregation (Phase 4 / A.2), extracted from index.ts.
// The ipc handler walks ~/.claude/projects/**/*.jsonl and caches; this module
// holds the period math + per-line bucketing so it is unit-testable in isolation.

import type { ClaudePeriodTotals, ClaudeUsageSummary, PeriodBoundaries } from './claude-usage.types'

export function startOfDayMs(now: Date): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfWeekMs(now: Date): number {
  // Week starts Monday 00:00 local. (Most Claude plans reset on a fixed
  // weekday — Monday is the closest universal anchor; users can correct via
  // configurable caps.)
  const d = new Date(now)
  const day = d.getDay() // 0 = Sun
  const back = (day + 6) % 7 // days since Monday
  d.setDate(d.getDate() - back)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function startOfMonthMs(now: Date): number {
  const d = new Date(now)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function emptyTotals(): ClaudePeriodTotals {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
}

export function addToPeriod(p: ClaudePeriodTotals, u: Record<string, unknown>): void {
  const ino = Number(u.input_tokens) || 0
  const outo = Number(u.output_tokens) || 0
  const cc = Number(u.cache_creation_input_tokens) || 0
  const cr = Number(u.cache_read_input_tokens) || 0
  p.inputTokens += ino
  p.outputTokens += outo
  p.cachedTokens += cc + cr
  p.totalTokens += ino + outo + cc + cr
}

// Boundaries + an empty summary scaffold for `now`.
export function newSummary(now: Date): { summary: ClaudeUsageSummary; bounds: PeriodBoundaries } {
  const dayStart = startOfDayMs(now)
  const weekStart = startOfWeekMs(now)
  const monthStart = startOfMonthMs(now)
  const summary: ClaudeUsageSummary = {
    today: emptyTotals(),
    thisWeek: emptyTotals(),
    thisMonth: emptyTotals(),
    sessions: 0,
    lastModel: null,
    lastSpeed: null,
    thinkingDetected: false,
    resetTimes: {
      day: dayStart + 24 * 3600_000,
      week: weekStart + 7 * 24 * 3600_000,
      month: (() => {
        const d = new Date(monthStart)
        d.setMonth(d.getMonth() + 1)
        return d.getTime()
      })()
    }
  }
  return { summary, bounds: { dayStart, weekStart, monthStart } }
}

// Parse one JSONL line and bucket its usage into the summary. Returns true if the
// line counts toward "today" (so the caller can mark a session touched).
export function applyJsonlLine(
  summary: ClaudeUsageSummary,
  line: string,
  bounds: PeriodBoundaries
): boolean {
  if (!line.trim()) return false
  let o: Record<string, unknown>
  try {
    o = JSON.parse(line)
  } catch {
    return false
  }
  const ts = typeof o.timestamp === 'string' ? new Date(o.timestamp as string).getTime() : 0
  if (!ts || ts < bounds.monthStart) return false
  const msg = o.message as Record<string, unknown> | undefined
  if (!msg || typeof msg !== 'object') return false
  if (typeof msg.model === 'string') summary.lastModel = msg.model as string
  let touchedToday = false
  const u = msg.usage as Record<string, unknown> | undefined
  if (u && typeof u === 'object') {
    if (typeof u.speed === 'string') summary.lastSpeed = u.speed as string
    addToPeriod(summary.thisMonth, u)
    if (ts >= bounds.weekStart) addToPeriod(summary.thisWeek, u)
    if (ts >= bounds.dayStart) {
      addToPeriod(summary.today, u)
      touchedToday = true
    }
  }
  const content = msg.content as unknown[] | undefined
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c && typeof c === 'object' && (c as { type?: string }).type === 'thinking') {
        summary.thinkingDetected = true
        break
      }
    }
  }
  return touchedToday
}
