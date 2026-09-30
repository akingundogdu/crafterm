import { panes } from '@views/state/spine'
import { profilerService } from '@services'
import { drainCounters, setCountersEnabled } from '@services/profiler/profiler.counters'
import type { ProfilerRecord } from '@services/profiler/profiler.types'

// The profiler's renderer half. It answers the question a DevTools recording
// cannot at this timescale: a 90-minute Performance trace is unusable, so this
// samples and aggregates instead, and writes one JSONL line per event or sample.
//
// What it captures, and why each one is here:
// - long tasks: the main thread blocking is what "the app froze" actually is
// - input timing: the measured form of "my keystroke took seconds to appear"
// - heap: growth that never comes back down is the shape behind slow GC pauses
// - uncaught errors, deduplicated: a total that climbs with uptime is a leak
// - renderer counters: which subsystem the work belongs to
//
// Nothing is observed until startProfiler() runs, so the hooks in hot paths cost a
// boolean check while it is off.

const SAMPLE_MS = 5000
// The Long Task API already fires at 50ms. Only tasks this long get their own line
// — the rest are counted in the sample, which keeps a 90-minute log readable.
const LONGTASK_LOG_MS = 200
// Below this an input delay is scheduling noise rather than something a user feels.
const INPUT_THRESHOLD_MS = 120

interface HeapInfo {
  usedJSHeapSize: number
}

let running = false
let startedAt = 0
let logPath = ''
let timer: number | null = null
let observers: PerformanceObserver[] = []
let pending: ProfilerRecord[] = []
let longTasks = 0
const errorTotals = new Map<string, number>()
const errorDeltas = new Map<string, number>()

export const isProfilerRunning = (): boolean => running
export const profilerLogPath = (): string => logPath

const now = (): number => Date.now() - startedAt

// Non-standard but present in Chromium; absent in other engines, so treat it as
// optional rather than assuming it.
function heapMB(): number | null {
  const mem = (performance as Performance & { memory?: HeapInfo }).memory
  return mem ? Math.round(mem.usedJSHeapSize / 1048576) : null
}

function observe(type: string, onEntry: (entry: PerformanceEntry) => void, extra: object = {}): void {
  try {
    const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry))
    observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit)
    observers.push(observer)
  } catch {
    // Not every entry type exists in every Chromium build. A missing observer
    // costs one signal, not the session.
  }
}

function noteError(message: string): void {
  errorTotals.set(message, (errorTotals.get(message) ?? 0) + 1)
  errorDeltas.set(message, (errorDeltas.get(message) ?? 0) + 1)
}

const onWindowError = (e: ErrorEvent): void => {
  noteError(e.message || 'unknown error')
}

const onRejection = (e: PromiseRejectionEvent): void => {
  noteError(`unhandled rejection: ${String(e.reason).slice(0, 200)}`)
}

function flush(): void {
  const counters = drainCounters()
  let errors = 0
  for (const [message, count] of errorDeltas) {
    errors += count
    pending.push({
      kind: 'error',
      t: now(),
      message: message.slice(0, 300),
      count,
      total: errorTotals.get(message) ?? count
    })
  }
  errorDeltas.clear()

  pending.push({
    kind: 'renderer',
    t: now(),
    heapMB: heapMB(),
    panes: panes.size,
    treeRows: counters.treeRows,
    rebuilds: counters.rebuilds,
    rebuildMs: Math.round(counters.rebuildMs),
    ipcCalls: counters.ipcCalls,
    ipcMs: Math.round(counters.ipcMs),
    longTasks,
    errors
  })
  longTasks = 0

  const batch = pending
  pending = []
  profilerService.append(batch)
}

export async function startProfiler(): Promise<string> {
  if (running) return logPath
  const session = await profilerService.start()
  startedAt = session.startedAt
  logPath = session.path
  running = true
  setCountersEnabled(true)

  observe('longtask', (entry) => {
    longTasks++
    if (entry.duration >= LONGTASK_LOG_MS) {
      pending.push({ kind: 'longtask', t: now(), ms: Math.round(entry.duration), name: entry.name })
    }
  })
  observe(
    'event',
    (entry) => {
      if (entry.duration < INPUT_THRESHOLD_MS) return
      pending.push({ kind: 'input', t: now(), ms: Math.round(entry.duration), name: entry.name })
    },
    { durationThreshold: INPUT_THRESHOLD_MS }
  )

  window.addEventListener('error', onWindowError)
  window.addEventListener('unhandledrejection', onRejection)
  timer = window.setInterval(flush, SAMPLE_MS)
  return logPath
}

export async function stopProfiler(): Promise<void> {
  if (!running) return
  flush() // keep the last interval rather than discarding it
  if (timer !== null) window.clearInterval(timer)
  timer = null
  for (const observer of observers) observer.disconnect()
  observers = []
  window.removeEventListener('error', onWindowError)
  window.removeEventListener('unhandledrejection', onRejection)
  setCountersEnabled(false)
  errorTotals.clear()
  errorDeltas.clear()
  longTasks = 0
  running = false
  await profilerService.stop()
}
