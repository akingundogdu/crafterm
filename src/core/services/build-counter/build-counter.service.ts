import { watch as fsWatch, type FSWatcher, readFileSync } from 'fs'
import { writeCounters } from './build-counter.utils'

// Monotonic build counter: increments on every save under the source repo while
// the app is running. Stored per-repo in <stateDir>/build-counter.json and never
// reset — gives the version chip a "+N" that ticks up as code changes, surfacing
// edits without a commit or redeploy. The recursive watcher is started lazily on
// the first query and survives restarts via the persisted count.
const watchers = new Map<string, FSWatcher>()
const timers = new Map<string, NodeJS.Timeout>()

export function readCounters(file: string): Record<string, number> {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (!data || typeof data !== 'object') return {}
    return data as Record<string, number>
  } catch {
    return {}
  }
}

// Build output, dependencies, and git internals are not source edits, so changes
// under these path segments never bump the counter.
const BUILD_COUNTER_IGNORE = ['.git', 'node_modules', 'out', 'dist']
export function isIgnoredBuildPath(file: string): boolean {
  return file.split(/[\\/]/).some((seg) => BUILD_COUNTER_IGNORE.includes(seg))
}

export function ensureWatcher(repo: string, file: string): void {
  if (watchers.has(repo)) return
  try {
    const watcher = fsWatch(repo, { persistent: false, recursive: true }, (_evt, filename) => {
      if (filename && isIgnoredBuildPath(filename.toString())) return
      // Debounce: one save can fire several events; collapse to a single +1.
      const prev = timers.get(repo)
      if (prev) clearTimeout(prev)
      const t = setTimeout(() => {
        timers.delete(repo)
        const counters = readCounters(file)
        counters[repo] = (counters[repo] ?? 0) + 1
        writeCounters(file, counters)
      }, 300)
      timers.set(repo, t)
    })
    watcher.on('error', () => {
      watcher.close()
      watchers.delete(repo)
    })
    watchers.set(repo, watcher)
  } catch {
    /* ignore */
  }
}

// Current monotonic save count for the source repo; starts the watcher on first
// call so subsequent saves are counted.
export function getCount(repo: string, file: string): number {
  ensureWatcher(repo, file)
  return readCounters(file)[repo] ?? 0
}

// Close every watcher and cancel pending increments (test/teardown hygiene).
export function closeAll(): void {
  for (const w of watchers.values()) {
    try {
      w.close()
    } catch {
      /* already closed */
    }
  }
  watchers.clear()
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}
