import type { MemoryMetrics, ProcessGroup } from '@services/system/system.types'

// Pure parsing + aggregation for the system resource metrics. Everything that
// touches the OS lives in system-metrics.service.ts; this file only turns raw
// `vm_stat` / `sysctl` / `ps` text into numbers, so it is directly unit-testable.

export interface CpuSample {
  busy: number
  total: number
}

export interface ProcRow {
  pid: number
  uid: number
  rssBytes: number
  cpuSeconds: number // cumulative CPU time since the process started
  command: string
}

export type MemoryBreakdown = Omit<MemoryMetrics, 'swapUsedBytes' | 'swapTotalBytes'>

const clampPct = (v: number): number => (v < 0 ? 0 : v > 100 ? 100 : v)

// ---- CPU -------------------------------------------------------------------

// Fold os.cpus() tick counters into one busy/total pair. Absolute counts are
// meaningless on their own; the percentage comes from the delta between two.
export function cpuSample(cores: { times: Record<string, number> }[]): CpuSample {
  let busy = 0
  let idle = 0
  for (const core of cores) {
    const t = core.times
    busy += (t.user ?? 0) + (t.nice ?? 0) + (t.sys ?? 0) + (t.irq ?? 0)
    idle += t.idle ?? 0
  }
  return { busy, total: busy + idle }
}

// Machine-wide CPU usage between two samples. Without a previous sample there is
// no interval to measure, so it reports 0 rather than the misleading since-boot
// average.
export function cpuUsagePct(prev: CpuSample | null, next: CpuSample): number {
  if (!prev) return 0
  const total = next.total - prev.total
  if (total <= 0) return 0
  return clampPct(((next.busy - prev.busy) / total) * 100)
}

// ---- memory ----------------------------------------------------------------

// Read one "<label>: <pages>." counter out of `vm_stat` output.
function vmStatPages(out: string, label: string): number {
  const match = new RegExp(`^"?${label}"?:\\s+(\\d+)`, 'm').exec(out)
  return match ? Number(match[1]) : 0
}

// Turn `vm_stat` into Activity Monitor's Memory tab figures. "Memory Used" there
// is app memory (anonymous pages the apps actually own) + wired + compressed;
// file-backed and purgeable pages are cache the OS reclaims on demand, so they
// stay out of the used total. Returns null when the output is not vm_stat's.
export function parseVmStat(out: string, totalBytes: number): MemoryBreakdown | null {
  const pageSize = Number(/page size of (\d+) bytes/.exec(out)?.[1] ?? 0)
  if (!pageSize || !totalBytes) return null

  const purgeable = vmStatPages(out, 'Pages purgeable')
  const appBytes = Math.max(0, vmStatPages(out, 'Anonymous pages') - purgeable) * pageSize
  const wiredBytes = vmStatPages(out, 'Pages wired down') * pageSize
  const compressedBytes = vmStatPages(out, 'Pages occupied by compressor') * pageSize
  const cachedBytes = (vmStatPages(out, 'File-backed pages') + purgeable) * pageSize
  const usedBytes = Math.min(totalBytes, appBytes + wiredBytes + compressedBytes)

  return {
    totalBytes,
    usedBytes,
    usedPct: clampPct((usedBytes / totalBytes) * 100),
    appBytes,
    wiredBytes,
    compressedBytes,
    cachedBytes
  }
}

// `sysctl -n vm.swapusage` → "total = 4096.00M  used = 2565.38M  free = 1530.62M".
export function parseSwapUsage(out: string): { usedBytes: number; totalBytes: number } {
  const size = (label: string): number => {
    const match = new RegExp(`${label}\\s*=\\s*([\\d.]+)([KMG])`).exec(out)
    if (!match) return 0
    const unit = match[2] === 'G' ? 1024 ** 3 : match[2] === 'M' ? 1024 ** 2 : 1024
    return Math.round(Number(match[1]) * unit)
  }
  return { usedBytes: size('used'), totalBytes: size('total') }
}

// ---- processes -------------------------------------------------------------

// `ps -o time` prints cumulative CPU time as [[DD-]HH:]MM:SS[.cc] — "1:54.09" is
// one minute, "103:37.32" is 103 minutes, "2-03:04:05" is two days in.
export function parseCpuTime(value: string): number {
  const [days, clock] = value.includes('-') ? value.split('-') : ['0', value]
  const parts = clock.split(':').map(Number)
  if (parts.some((p) => Number.isNaN(p))) return 0
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + part
  return seconds + Number(days) * 86400
}

// One row of `ps -Ao pid=,uid=,rss=,time=,comm=`. The command is the last field
// and may itself contain spaces, so the four numeric columns are matched first.
const PS_ROW = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/

export function parsePsOutput(out: string): ProcRow[] {
  const rows: ProcRow[] = []
  for (const line of out.split('\n')) {
    const match = PS_ROW.exec(line)
    if (!match) continue
    const command = match[5].trim()
    if (!command || command === '-') continue
    rows.push({
      pid: Number(match[1]),
      uid: Number(match[2]),
      rssBytes: Number(match[3]) * 1024,
      cpuSeconds: parseCpuTime(match[4]),
      command
    })
  }
  return rows
}

// The application a process belongs to. Helpers live inside nested bundles
// ("…/Google Chrome.app/…/Google Chrome Helper (Renderer).app/…"), so the FIRST
// .app on the path is the owning application — that is what Activity Monitor
// groups by.
//
// Plain executables group by their NAME, not their path: the same tool runs from
// several locations (a host and a simulator `diagnosticd`, half a dozen `node`
// installs) and grouping by path produced multiple rows the user cannot tell
// apart, since all a row shows is the name.
export function appIdentity(command: string): { key: string; name: string } {
  const appEnd = command.indexOf('.app/')
  if (appEnd > 0) {
    const bundle = command.slice(0, appEnd + 4)
    return { key: bundle, name: basename(bundle).replace(/\.app$/, '') }
  }
  const name = basename(command)
  return { key: name, name }
}

function basename(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut === -1 ? path : path.slice(cut + 1)
}

// Fold process rows into per-application groups. CPU percentage is the growth of
// each process's cumulative CPU time over the sampling interval, so it reflects
// the last few seconds instead of the process's whole lifetime average; it is
// core-relative (Activity Monitor's convention), hence >100 for busy apps.
export function groupProcesses(
  rows: ProcRow[],
  previousCpu: Map<number, number>,
  elapsedSec: number,
  ctx: { ownUid: number; ownKey: string | null }
): ProcessGroup[] {
  const byKey = new Map<string, ProcessGroup>()
  for (const row of rows) {
    const { key, name } = appIdentity(row.command)
    const before = previousCpu.get(row.pid)
    const cpuPct =
      elapsedSec > 0 && before !== undefined && row.cpuSeconds >= before
        ? ((row.cpuSeconds - before) / elapsedSec) * 100
        : 0

    const existing = byKey.get(key)
    if (existing) {
      existing.pids.push(row.pid)
      existing.cpuPct += cpuPct
      existing.memoryBytes += row.rssBytes
      existing.canQuit = existing.canQuit && row.uid === ctx.ownUid
      continue
    }
    byKey.set(key, {
      key,
      name,
      pids: [row.pid],
      cpuPct,
      memoryBytes: row.rssBytes,
      isOwn: ctx.ownKey !== null && key === ctx.ownKey,
      canQuit: row.uid === ctx.ownUid
    })
  }

  for (const group of byKey.values()) {
    group.cpuPct = Math.round(group.cpuPct * 10) / 10
    if (group.isOwn) group.canQuit = false
  }
  return [...byKey.values()]
}

// The union of the heaviest CPU and heaviest memory consumers — the renderer
// sorts by either, so both ends of the list must survive the trim.
export function topGroups(groups: ProcessGroup[], limit: number): ProcessGroup[] {
  const byCpu = [...groups].sort((a, b) => b.cpuPct - a.cpuPct).slice(0, limit)
  const byMemory = [...groups].sort((a, b) => b.memoryBytes - a.memoryBytes).slice(0, limit)
  const seen = new Set<string>()
  return [...byCpu, ...byMemory].filter((g) => (seen.has(g.key) ? false : seen.add(g.key)))
}
