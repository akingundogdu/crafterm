import { mkdirSync, appendFileSync } from 'fs'
import { join } from 'path'
import { stateDir } from '@core/services/paths/paths.service'
import type { MainSample, ProfilerRecord, ProfilerSession } from '@services/profiler/profiler.types'

// The profiler's main-process half: it owns the log file and samples what only
// main can see (its own CPU/RSS, the child processes it spawns, how long its IPC
// handlers take). The renderer streams its own records in over `append`.
//
// Everything here is inert until `start()` runs, and the counter hooks below are
// called from hot paths (every IPC handler, every child spawn), so they must stay
// a boolean check plus two additions when profiling is off.

const SAMPLE_MS = 5000

let file: string | null = null
let startedAt = 0
let timer: NodeJS.Timeout | null = null
let lastCpu: NodeJS.CpuUsage | null = null
let lastSampleAt = 0

// Counters, reset on every sample so each record is a delta.
let spawns = 0
let spawnMs = 0
let slowestSpawn: { name: string; ms: number } | null = null
let ipcHandled = 0
let ipcMs = 0
let slowestIpc: { name: string; ms: number } | null = null

export const isRunning = (): boolean => file !== null

// A child process the main process spawned (lsof, git, …). Called from the exec
// service so the log shows whether pane polling is the load.
export function noteSpawn(name: string, ms: number): void {
  if (!file) return
  spawns++
  spawnMs += ms
  if (!slowestSpawn || ms > slowestSpawn.ms) slowestSpawn = { name, ms }
}

// One IPC handler round-trip, timed in channels.main's `handle` wrapper.
export function noteIpc(name: string, ms: number): void {
  if (!file) return
  ipcHandled++
  ipcMs += ms
  if (!slowestIpc || ms > slowestIpc.ms) slowestIpc = { name, ms }
}

function writeRecords(records: ProfilerRecord[]): void {
  if (!file || !Array.isArray(records) || !records.length) return
  try {
    appendFileSync(file, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  } catch {
    // A failed write must not take the app down — the session just loses a sample.
  }
}

// Main-process CPU share since the previous sample: process.cpuUsage() is
// cumulative microseconds, so the delta over the wall-clock interval is the share
// of ONE core (it can exceed 100 only across threads).
function sampleMain(): void {
  if (!file) return
  const now = Date.now()
  const cpu = process.cpuUsage()
  const elapsedMs = Math.max(1, now - lastSampleAt)
  const usedMs = lastCpu ? (cpu.user - lastCpu.user + cpu.system - lastCpu.system) / 1000 : 0
  lastCpu = cpu
  lastSampleAt = now

  const record: MainSample = {
    kind: 'main',
    t: now - startedAt,
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
    cpuPct: Math.round((usedMs / elapsedMs) * 100),
    spawns,
    spawnMs: Math.round(spawnMs),
    slowestSpawn: slowestSpawn ? `${slowestSpawn.name} ${Math.round(slowestSpawn.ms)}ms` : null,
    ipcHandled,
    ipcMs: Math.round(ipcMs),
    slowestIpc: slowestIpc ? `${slowestIpc.name} ${Math.round(slowestIpc.ms)}ms` : null
  }
  spawns = 0
  spawnMs = 0
  slowestSpawn = null
  ipcHandled = 0
  ipcMs = 0
  slowestIpc = null
  writeRecords([record])
}

// Begin a session. Each start opens its own file so two investigations never
// interleave in one log.
export function start(): ProfilerSession {
  if (file) return { path: file, startedAt }
  const dir = join(stateDir(), 'profiler')
  mkdirSync(dir, { recursive: true })
  startedAt = Date.now()
  const stamp = new Date(startedAt).toISOString().replace(/[:.]/g, '-')
  file = join(dir, `${stamp}.jsonl`)
  lastCpu = process.cpuUsage()
  lastSampleAt = startedAt
  // Start clean: a prior session may have left deltas between its last sample and
  // its stop(), and those must not bleed into this session's first sample.
  spawns = 0
  spawnMs = 0
  slowestSpawn = null
  ipcHandled = 0
  ipcMs = 0
  slowestIpc = null
  timer = setInterval(sampleMain, SAMPLE_MS)
  return { path: file, startedAt }
}

export function stop(): void {
  if (timer) clearInterval(timer)
  timer = null
  file = null
  lastCpu = null
}

// Renderer-side records arrive in batches; they are already timestamped relative
// to the session start the renderer was told about.
export function append(records: ProfilerRecord[]): void {
  writeRecords(records)
}
