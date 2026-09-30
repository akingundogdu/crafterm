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
  if (!value) drainCounters()
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
