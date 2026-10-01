// Renderer-side counters the profiler drains on each sample. They live here, in
// @services, because `channels.client` feeds the IPC numbers and must not import
// from @views; the collector in @views/profiler reads them back out.
//
// Every hook is a boolean check plus two additions, and `enabled` is false unless
// a profiler session is running, so leaving the calls in hot paths costs nothing.

let enabled = false

const counters = {
  ipcCalls: 0,
  ipcMs: 0,
  rebuilds: 0,
  rebuildMs: 0,
  treeRows: 0
}

export type RendererCounters = typeof counters

// Exposed so a caller can skip building an argument that is only needed while
// profiling (e.g. counting visible tree rows).
export const isCountersEnabled = (): boolean => enabled

export function setCountersEnabled(value: boolean): void {
  enabled = value
  if (!value) {
    drainCounters()
    sections.clear()
    slowCalls = []
  }
}

// One renderer→main IPC round-trip, timed in channels.client's `call`.
export function noteIpcCall(ms: number): void {
  if (!enabled) return
  counters.ipcCalls++
  counters.ipcMs += ms
}

// One sidebar tree rebuild. `rows` is a level rather than a delta — it is the size
// of the model that was rebuilt, so the log shows cost against tree size.
export function noteTreeRebuild(ms: number, rows: number): void {
  if (!enabled) return
  counters.rebuilds++
  counters.rebuildMs += ms
  counters.treeRows = rows
}

// A single call slower than this gets its own log line; everything else is only
// counted. 30ms is roughly two dropped frames — below it, a call is not what the
// user felt.
const SLOW_CALL_MS = 30

export interface SectionTotals {
  calls: number
  ms: number
  maxMs: number
}

const sections = new Map<string, SectionTotals>()
let slowCalls: { label: string; ms: number; at: number }[] = []

// Timing primitive for the instrumented chokepoints. Deliberately NOT a
// `measure(label, fn)` wrapper: the hottest site is one xterm write per PTY chunk,
// and a callback wrapper would allocate a closure per call even with profiling off.
// This costs one boolean check and returns 0 as the "not timing" sentinel.
export const sectionStart = (): number => (enabled ? performance.now() : 0)

export function sectionEnd(label: string, started: number): void {
  if (!enabled || started === 0) return
  const ms = performance.now() - started
  const totals = sections.get(label)
  if (totals) {
    totals.calls++
    totals.ms += ms
    if (ms > totals.maxMs) totals.maxMs = ms
  } else {
    sections.set(label, { calls: 1, ms, maxMs: ms })
  }
  if (ms >= SLOW_CALL_MS) slowCalls.push({ label, ms, at: Date.now() })
}

// Read and reset, like drainCounters: each sample covers one interval.
export function drainSections(): { label: string; totals: SectionTotals }[] {
  const out = [...sections].map(([label, totals]) => ({ label, totals }))
  sections.clear()
  return out
}

export function drainSlowCalls(): { label: string; ms: number; at: number }[] {
  const out = slowCalls
  slowCalls = []
  return out
}

// Read and reset: each sample records the interval since the previous one. The row
// count is a level, so it survives the reset.
export function drainCounters(): RendererCounters {
  const snapshot = { ...counters }
  counters.ipcCalls = 0
  counters.ipcMs = 0
  counters.rebuilds = 0
  counters.rebuildMs = 0
  return snapshot
}
