import type { DailyPlanStatus } from '../../types'

// Pure date + column helpers for the daily plan board. No state/DOM — the YYYY-MM-DD
// keys compare lexicographically, so string range checks elsewhere are correct.

// The board column a status renders under: 'review' and 'test' fold into the In
// Progress column; every other status maps to its own column.
export function boardColumnOf(status: DailyPlanStatus): DailyPlanStatus {
  return status === 'review' || status === 'test' ? 'wip' : status
}

export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map((n) => parseInt(n, 10))
  return new Date(y, (m || 1) - 1, d || 1)
}

export function shiftDays(date: string, delta: number): string {
  const d = parseYmd(date)
  d.setDate(d.getDate() + delta)
  return ymd(d)
}
