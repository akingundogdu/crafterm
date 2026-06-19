import type { TimeEntry } from '@ui/types'

// Pure time-tracking logic: duration formatting, range boundaries, and the
// per-project / per-feature aggregation that the Time panel and report modal
// render. No DOM, no IPC — `now` is injectable so the math is testable.

export type Range = 'today' | 'week' | 'month' | 'all'

// "HH:MM:SS" elapsed clock for the active timer.
export function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}

// Compact "Nh Mm" / "Mm" duration for summary rows.
export function fmtHM(ms: number): string {
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

// Epoch ms for local midnight today.
export function startOfToday(now: number = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// Epoch ms for the start of a report range (0 = all time).
export function rangeStart(range: Range, now: number = Date.now()): number {
  const d = new Date(now)
  if (range === 'today') {
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (range === 'week') {
    d.setDate(d.getDate() - 6)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (range === 'month') {
    d.setDate(d.getDate() - 29)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  return 0
}

// An in-progress span (active timer / auto session) not yet written to entries.
export interface OngoingSpan {
  projectPath: string
  ms: number
}

// Total tracked ms per project for entries ending at/after `from`, plus any
// ongoing spans. Drives the Time panel "Today" summary.
export function sumByProject(
  entries: TimeEntry[],
  from: number,
  ongoing: OngoingSpan[] = []
): Map<string, number> {
  const byProj = new Map<string, number>()
  for (const e of entries) {
    if (e.end < from) continue
    byProj.set(e.projectPath, (byProj.get(e.projectPath) ?? 0) + (e.end - e.start))
  }
  for (const o of ongoing) {
    byProj.set(o.projectPath, (byProj.get(o.projectPath) ?? 0) + o.ms)
  }
  return byProj
}

export interface ProjectReport {
  total: number
  feats: Map<string, number>
}

// Per-project totals broken down by feature (key '' = no feature), for entries
// ending at/after `from`. Drives the report modal.
export function reportByProject(entries: TimeEntry[], from: number): Map<string, ProjectReport> {
  const byProj = new Map<string, ProjectReport>()
  for (const e of entries) {
    if (e.end < from) continue
    let p = byProj.get(e.projectPath)
    if (!p) {
      p = { total: 0, feats: new Map() }
      byProj.set(e.projectPath, p)
    }
    const ms = e.end - e.start
    p.total += ms
    const fk = e.featureId ?? ''
    p.feats.set(fk, (p.feats.get(fk) ?? 0) + ms)
  }
  return byProj
}
