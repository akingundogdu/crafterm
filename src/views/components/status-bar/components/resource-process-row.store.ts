import { UITexts } from '@texts'
import { formatBytes } from './resource-chip.store'
import type { ProcessGroup } from '@services/system/system.types'

// Non-view module for one application row in the resource popover: how its numbers
// read and which actions it offers. The shared state + IPC live in
// resource-chip.store.

export interface RowActionVM {
  key: 'quit' | 'force'
  label: string
  title: string
  force: boolean
}

// CPU is core-relative (Activity Monitor's convention), so a multi-threaded app can
// read above 100%; one decimal below 10% keeps quiet apps from all showing "0%".
export function formatRowCpu(cpuPct: number): string {
  return cpuPct >= 10 ? `${Math.round(cpuPct)}%` : `${cpuPct.toFixed(1)}%`
}

export function formatRowMemory(bytes: number): string {
  return formatBytes(bytes)
}

// Hover text for a row: how many processes the application folds together, since
// the row itself only shows the aggregate.
export function rowTitle(group: ProcessGroup): string {
  const count = group.pids.length
  return count > 1 ? `${group.name} · ${count} processes` : group.name
}

// Quit actions, offered only for another user-owned application: Crafterm never
// lists an action that would kill itself, and a root-owned process cannot be
// signalled at all.
export function actionsFor(group: ProcessGroup): RowActionVM[] {
  if (!group.canQuit) return []
  const T = UITexts.Resources.popover
  return [
    { key: 'quit', label: T.quit, title: T.quitTitle(group.name), force: false },
    { key: 'force', label: T.force, title: T.forceTitle(group.name), force: true }
  ]
}
