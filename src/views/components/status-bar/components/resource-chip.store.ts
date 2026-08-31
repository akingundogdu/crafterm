import { Store } from '@geajs/core'
import { systemService } from '@services'
import { promptConfirm } from '@views/components/dialog/confirm'
import { UITexts } from '@texts'
import type { SystemMetrics, ProcessGroup } from '@services/system/system.types'

// State + IPC for the status-bar resource chip and its popover. The chip polls the
// cheap CPU/memory snapshot continuously; the far more expensive per-process scan
// (`ps -A` on every tick) runs ONLY while the popover is open, so a closed chip
// costs one vm_stat + one sysctl every few seconds.

export const METRICS_POLL_MS = 3_000
export const PROCESS_POLL_MS = 4_000
// Above this the chip's readout turns amber, then red — a glanceable warning that
// the machine is running hot without opening the popover.
export const WARN_PCT = 75
export const HIGH_PCT = 90
// Rows the popover lists; the main process already trims to the heaviest apps.
export const TOP_ROWS = 8

export type SortKey = 'cpu' | 'memory'

const GB = 1024 ** 3
const MB = 1024 ** 2

// Compact byte size for the popover ("12.4 GB", "820 MB").
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`
  return `${Math.max(0, Math.round(bytes / 1024))} KB`
}

// Whole-number percentage for the chip; the popover bars use the same value.
export function formatPct(value: number): string {
  return `${Math.round(value)}%`
}

// Severity class suffix driving the chip/bar colour.
export function levelOf(pct: number): 'high' | 'warn' | '' {
  if (pct >= HIGH_PCT) return 'high'
  if (pct >= WARN_PCT) return 'warn'
  return ''
}

class ResourceStore extends Store {
  metrics: SystemMetrics | null = null
  groups: ProcessGroup[] = []
  sortBy: SortKey = 'cpu'
  isOpen = false
  // Popover anchor, measured from the chip when it opens (fixed positioning).
  anchorTop = 34
  anchorLeft = 10
  busyKey: string | null = null
  error = ''

  private metricsTimer: number | null = null
  private processTimer: number | null = null
  private started = false
  private docDown: ((e: MouseEvent) => void) | null = null

  // Begin polling the machine metrics. Called once, when the chip mounts.
  start(): void {
    if (this.started) return
    this.started = true
    void this.refreshMetrics()
    this.metricsTimer = window.setInterval(() => void this.refreshMetrics(), METRICS_POLL_MS)
  }

  async refreshMetrics(): Promise<void> {
    try {
      this.metrics = await systemService.metrics()
    } catch {
      // keep the last reading — a failed poll must not blank the chip
    }
  }

  async refreshProcesses(): Promise<void> {
    try {
      const listing = await systemService.processes()
      this.groups = listing.groups
    } catch {
      // keep the last listing
    }
  }

  toggle(anchor: { top: number; left: number }): void {
    if (this.isOpen) {
      this.close()
      return
    }
    this.anchorTop = anchor.top
    this.anchorLeft = anchor.left
    this.isOpen = true
    this.error = ''
    void this.refreshProcesses()
    this.processTimer = window.setInterval(() => void this.refreshProcesses(), PROCESS_POLL_MS)
    // Dismiss on an outside click, but ignore clicks inside a modal overlay — the
    // quit confirmation opens over the popover and must not close it.
    this.docDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.resource-popover') || target?.closest('.resource-chip')) return
      if (target?.closest('.modal-overlay')) return
      this.close()
    }
    setTimeout(() => {
      if (this.docDown) document.addEventListener('mousedown', this.docDown, true)
    })
  }

  close(): void {
    this.isOpen = false
    if (this.processTimer !== null) window.clearInterval(this.processTimer)
    this.processTimer = null
    if (this.docDown) document.removeEventListener('mousedown', this.docDown, true)
    this.docDown = null
  }

  setSort(key: SortKey): void {
    this.sortBy = key
  }

  // The popover's visible rows: heaviest first by the active sort.
  get rows(): ProcessGroup[] {
    const sorted = [...this.groups].sort((a, b) =>
      this.sortBy === 'cpu' ? b.cpuPct - a.cpuPct : b.memoryBytes - a.memoryBytes
    )
    return sorted.slice(0, TOP_ROWS)
  }

  // Quit (SIGTERM) or force quit (SIGKILL) every process of one application,
  // after an explicit confirmation.
  async quit(group: ProcessGroup, force: boolean): Promise<void> {
    const T = UITexts.Resources.confirm
    // A fresh array: the group is a Store proxy and cannot be structured-cloned.
    const pids = [...group.pids]
    const name = group.name
    const confirmed = await promptConfirm({
      title: force ? T.forceTitle : T.quitTitle,
      message: force ? T.forceMessage(name, pids.length) : T.quitMessage(name, pids.length),
      confirmText: force ? T.forceConfirm : T.quitConfirm
    })
    if (!confirmed) return

    this.busyKey = group.key
    try {
      const result = await systemService.quitProcess({ pids, force })
      this.error = result.ok ? '' : UITexts.Resources.popover.quitFailed
    } catch {
      this.error = UITexts.Resources.popover.quitFailed
    } finally {
      this.busyKey = null
    }
    await this.refreshProcesses()
  }
}

export default new ResourceStore()
