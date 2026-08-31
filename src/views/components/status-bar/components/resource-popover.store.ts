import { UITexts } from '@texts'
import { formatBytes, formatPct, levelOf } from './resource-chip.store'
import type { SortKey } from './resource-chip.store'
import type { SystemMetrics } from '@services/system/system.types'

// Non-view module for the resource popover: the view-model shapes its bars and
// detail rows are built from. State + IPC live in resource-chip.store (the chip and
// its popover share one store); this file holds the popover's own presentation
// logic and constants.

export interface MeterVM {
  key: string
  label: string
  pct: number
  detail: string
  level: 'high' | 'warn' | ''
}

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'cpu', label: UITexts.Resources.popover.sortCpu },
  { key: 'memory', label: UITexts.Resources.popover.sortMemory }
]

// The progress bars at the top of the popover: CPU, memory, and — only when the
// machine actually has swap in use — swap.
export function metersFor(metrics: SystemMetrics | null): MeterVM[] {
  if (!metrics) return []
  const T = UITexts.Resources.popover
  const { cpu, memory } = metrics
  const swapPct = memory.swapTotalBytes > 0 ? (memory.swapUsedBytes / memory.swapTotalBytes) * 100 : 0

  return [
    {
      key: 'cpu',
      label: T.cpu,
      pct: cpu.usagePct,
      detail: `${formatPct(cpu.usagePct)} · ${T.cores(cpu.coreCount)} · ${T.load(cpu.loadAvg1)}`,
      level: levelOf(cpu.usagePct)
    },
    {
      key: 'memory',
      label: T.memory,
      pct: memory.usedPct,
      detail: `${formatPct(memory.usedPct)} · ${T.of(formatBytes(memory.usedBytes), formatBytes(memory.totalBytes))}`,
      level: levelOf(memory.usedPct)
    },
    memory.swapUsedBytes > 0 && {
      key: 'swap',
      label: T.swap,
      pct: swapPct,
      detail: T.of(formatBytes(memory.swapUsedBytes), formatBytes(memory.swapTotalBytes)),
      level: levelOf(swapPct)
    }
  ].filter(Boolean) as MeterVM[]
}

// Activity Monitor's memory split, shown under the bars.
export function breakdownFor(metrics: SystemMetrics | null): { label: string; value: string }[] {
  if (!metrics) return []
  const T = UITexts.Resources.popover.breakdown
  const memory = metrics.memory
  return [
    { label: T.app, value: formatBytes(memory.appBytes) },
    { label: T.wired, value: formatBytes(memory.wiredBytes) },
    { label: T.compressed, value: formatBytes(memory.compressedBytes) },
    { label: T.cached, value: formatBytes(memory.cachedBytes) }
  ]
}
