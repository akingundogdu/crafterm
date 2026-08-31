import { cpus, totalmem, loadavg } from 'os'
import { run } from '../exec/exec.service'
import { BIN } from '../exec/exec.types'
import {
  cpuSample,
  cpuUsagePct,
  parseVmStat,
  parseSwapUsage,
  parsePsOutput,
  groupProcesses,
  appIdentity,
  topGroups,
  type CpuSample
} from './system-metrics.utils'
import type {
  SystemMetrics,
  ProcessListing,
  ProcessGroup,
  QuitProcessRequest,
  QuitProcessResult
} from '@services/system/system.types'

// Machine-wide CPU + memory usage and the per-application process breakdown for
// the status-bar resource chip. Both readings are DELTA based — CPU percentages
// only exist relative to a previous sample — so the module keeps the last sample
// of each and the first call after launch reports 0% until the next poll lands.
// prime() takes that first sample at startup so the very first poll is already
// meaningful.

// How many applications the popover can show; both ends of the list are kept so
// sorting by CPU or by memory in the renderer stays honest.
const TOP_GROUPS = 12

let lastCpuSample: CpuSample | null = null
let lastProcCpu = new Map<number, number>()
let lastProcAt = 0
// pid → owning group key, from the last listing. A quit request is only honoured
// for a pid that was actually listed, so the renderer cannot signal an arbitrary
// process id.
let lastProcOwner = new Map<number, string>()
let lastOwnKeys = new Set<string>()

// Take the first CPU tick sample so the first user-visible poll has an interval
// to measure against.
export function prime(): void {
  lastCpuSample = cpuSample(cpus())
}

// This app's own bundle key, so its processes are listed but never quittable.
function ownKey(): string | null {
  try {
    return appIdentity(process.execPath).key
  } catch {
    return null
  }
}

export async function metrics(): Promise<SystemMetrics> {
  const sample = cpuSample(cpus())
  const usagePct = cpuUsagePct(lastCpuSample, sample)
  lastCpuSample = sample

  const totalBytes = totalmem()
  const [vmOut, swapOut] = await Promise.all([
    run(BIN.vmStat, []),
    run(BIN.sysctl, ['-n', 'vm.swapusage'])
  ])
  const breakdown = vmOut ? parseVmStat(vmOut, totalBytes) : null
  const swap = swapOut ? parseSwapUsage(swapOut) : { usedBytes: 0, totalBytes: 0 }

  return {
    cpu: {
      usagePct: Math.round(usagePct * 10) / 10,
      coreCount: cpus().length,
      loadAvg1: Math.round(loadavg()[0] * 100) / 100
    },
    memory: {
      // vm_stat is the only source for the app/wired/compressed split; if it ever
      // fails, fall back to the coarse free-memory figure so the chip still reads.
      ...(breakdown ?? {
        totalBytes,
        usedBytes: 0,
        usedPct: 0,
        appBytes: 0,
        wiredBytes: 0,
        compressedBytes: 0,
        cachedBytes: 0
      }),
      swapUsedBytes: swap.usedBytes,
      swapTotalBytes: swap.totalBytes
    },
    sampledAt: Date.now()
  }
}

export async function processes(): Promise<ProcessListing> {
  const out = await run(BIN.ps, ['-Ao', 'pid=,uid=,rss=,time=,comm='])
  const now = Date.now()
  if (!out) return { groups: [], sampledAt: now }

  const rows = parsePsOutput(out)
  const elapsedSec = lastProcAt ? (now - lastProcAt) / 1000 : 0
  const groups = groupProcesses(rows, lastProcCpu, elapsedSec, {
    ownUid: process.getuid?.() ?? -1,
    ownKey: ownKey()
  })

  lastProcCpu = new Map(rows.map((r) => [r.pid, r.cpuSeconds]))
  lastProcAt = now
  lastProcOwner = new Map()
  lastOwnKeys = new Set()
  for (const group of groups) {
    if (group.isOwn) lastOwnKeys.add(group.key)
    for (const pid of group.pids) lastProcOwner.set(pid, group.key)
  }

  return { groups: sortForDisplay(topGroups(groups, TOP_GROUPS)), sampledAt: now }
}

function sortForDisplay(groups: ProcessGroup[]): ProcessGroup[] {
  return groups.sort((a, b) => b.cpuPct - a.cpuPct)
}

// Signal every process of one application. Only pids seen in the last listing are
// accepted, and this app's own processes are never signalled — a resource monitor
// must not be able to quit itself (or anything it never showed the user).
export function quitProcesses(req: QuitProcessRequest): QuitProcessResult {
  const pids = req.pids.filter((pid) => {
    const owner = lastProcOwner.get(pid)
    return owner !== undefined && !lastOwnKeys.has(owner)
  })
  if (!pids.length) return { ok: false, signalled: 0, error: 'unknown-process' }

  let signalled = 0
  let error: string | undefined
  for (const pid of pids) {
    try {
      process.kill(pid, req.force ? 'SIGKILL' : 'SIGTERM')
      signalled++
    } catch (err) {
      // ESRCH means it already exited — that is the outcome the user wanted.
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ESRCH') signalled++
      else error = code === 'EPERM' ? 'not-permitted' : 'signal-failed'
    }
  }
  return { ok: signalled > 0, signalled, error: signalled > 0 ? undefined : error }
}
