// System resource domain data models (system:* channels): machine-wide CPU +
// memory usage behind the status-bar chip, and the per-application process
// breakdown its popover lists.

export interface CpuMetrics {
  usagePct: number // 0-100 across every core
  coreCount: number
  loadAvg1: number
}

// Byte counters mirroring Activity Monitor's Memory tab: "Memory Used" is
// app + wired + compressed, while cached files sit outside it.
export interface MemoryMetrics {
  totalBytes: number
  usedBytes: number
  usedPct: number
  appBytes: number
  wiredBytes: number
  compressedBytes: number
  cachedBytes: number
  swapUsedBytes: number
  swapTotalBytes: number
}

export interface SystemMetrics {
  cpu: CpuMetrics
  memory: MemoryMetrics
  sampledAt: number
}

// One application's processes folded together (Activity Monitor style: every
// "<App> Helper (Renderer)" collapses into the owning .app bundle).
export interface ProcessGroup {
  key: string // grouping key: the .app bundle path, or the executable path
  name: string
  pids: number[]
  cpuPct: number // core-relative, so a multi-threaded app can exceed 100
  memoryBytes: number
  isOwn: boolean // Crafterm's own processes — never offered for quit
  canQuit: boolean // owned by the current user, so a signal can be delivered
}

export interface ProcessListing {
  groups: ProcessGroup[]
  sampledAt: number
}

export interface QuitProcessRequest {
  pids: number[]
  force?: boolean // SIGKILL instead of SIGTERM
}

export interface QuitProcessResult {
  ok: boolean
  signalled: number
  error?: string
}
