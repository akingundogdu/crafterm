export interface ClaudePeriodTotals {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}

export interface ClaudeUsageSummary {
  today: ClaudePeriodTotals
  thisWeek: ClaudePeriodTotals
  thisMonth: ClaudePeriodTotals
  sessions: number // sessions touched today
  lastModel: string | null
  lastSpeed: string | null // 'standard' | 'fast' — from message.usage.speed
  thinkingDetected: boolean // was a `thinking` content block seen this week
  resetTimes: { day: number; week: number; month: number } // next reset (ms epoch)
}

export interface PeriodBoundaries {
  dayStart: number
  weekStart: number
  monthStart: number
}
