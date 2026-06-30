import { collectBackgroundProcesses, killProcess, openProcessView } from '@services/bgproc'
import type { CollectedProcess } from '@services/bgproc'
import { iosService } from '@services'
import type { DeviceGroup } from './processes.types'

export const PROC_STATUS_LABEL: Record<string, string> = {
  running: 'running',
  done: 'done',
  idle: 'idle',
  waiting: 'waiting',
  archived: 'archived'
}

// Running first, then everything else; within a group keep tree order.
export function sortedProcesses(): CollectedProcess[] {
  return collectBackgroundProcesses().sort((a, b) => {
    const ar = a.proc.status === 'running' ? 0 : 1
    const br = b.proc.status === 'running' ? 0 : 1
    return ar - br
  })
}

export function filterProcesses(all: CollectedProcess[], query: string): CollectedProcess[] {
  const q = query.trim().toLowerCase()
  return all.filter(
    (c) =>
      !q ||
      `${c.proc.title} ${c.proc.command} ${c.proc.cwd} ${c.proc.target?.name ?? ''}`
        .toLowerCase()
        .includes(q)
  )
}

// Crafterm iOS runs grouped by target (kind + name), first-seen order preserved.
export function groupRunningDevices(): Map<string, DeviceGroup> {
  const runs = collectBackgroundProcesses().filter((c) => c.proc.target)
  const groups = new Map<string, DeviceGroup>()
  for (const c of runs) {
    const t = c.proc.target!
    const key = `${t.kind}:${t.name}`
    let g = groups.get(key)
    if (!g) {
      g = { name: t.name, kind: t.kind, items: [] }
      groups.set(key, g)
    }
    g.items.push(c)
  }
  return groups
}

export function filterDeviceItems(g: DeviceGroup, query: string): CollectedProcess[] {
  const q = query.trim().toLowerCase()
  return g.items.filter((c) => !q || `${g.name} ${c.proc.title} ${c.proc.cwd}`.toLowerCase().includes(q))
}

export function makeViewClick(stableId: string, close: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void openProcessView(stableId)
    close()
  }
}

export function makeKillClick(stableId: string, render: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    killProcess(stableId)
    render()
  }
}

// Stop the running app on a target: terminate the variant on the simulator/device,
// then clear the run PTY + row.
async function stopApp(c: CollectedProcess, render: () => void): Promise<void> {
  await iosService.worktreeStop(c.proc.cwd, c.project?.iosConfig)
  killProcess(c.proc.stableId)
  render()
}

export function makeStopAppClick(c: CollectedProcess, render: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    void stopApp(c, render)
  }
}
