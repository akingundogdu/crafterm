// Records written to the profiler log, one JSON object per line. Every record
// carries `t` — milliseconds since the session started — so renderer and main
// samples line up on a single timeline when the log is read back.

// A main-thread task that blocked long enough for the user to feel it. This is the
// signal behind "the app stopped responding", measured rather than reported.
export interface LongTaskRecord {
  kind: 'longtask'
  t: number
  ms: number
  name: string
}

// An input event whose end-to-end handling crossed the threshold — the measured
// form of "my keystroke took five seconds to show up".
export interface InputRecord {
  kind: 'input'
  t: number
  ms: number
  name: string
}

// Uncaught errors, deduplicated by message. `count` is how many fired since the
// previous record for that message, `total` how many since the session began —
// a total that climbs with uptime is the shape of an accumulating leak.
export interface ErrorRecord {
  kind: 'error'
  t: number
  message: string
  count: number
  total: number
}

// Periodic renderer snapshot. Counters are deltas since the previous sample.
export interface RendererSample {
  kind: 'renderer'
  t: number
  heapMB: number | null
  panes: number
  treeRows: number
  rebuilds: number
  rebuildMs: number
  ipcCalls: number
  ipcMs: number
  longTasks: number
  errors: number
}

// Periodic main-process snapshot. Counters are deltas since the previous sample.
export interface MainSample {
  kind: 'main'
  t: number
  rssMB: number
  cpuPct: number
  spawns: number
  spawnMs: number
  slowestSpawn: string | null
  ipcHandled: number
  ipcMs: number
  slowestIpc: string | null
}

export type ProfilerRecord =
  | LongTaskRecord
  | InputRecord
  | ErrorRecord
  | RendererSample
  | MainSample

// Returned when a session starts, so the renderer can tell the user (and the next
// reader of the log) where the file landed.
export interface ProfilerSession {
  path: string
  startedAt: number
}
