import { BrowserWindow } from 'electron'
import { mkdirSync, watch as fsWatch, type FSWatcher } from 'fs'

// Live fs watchers per <repo>/docs/plans dir. A change there means a plan file
// was created/renamed/removed, so we broadcast `plans:changed` to every window
// and the sidebar refreshes immediately instead of waiting on a poll.
const watchers = new Map<string, FSWatcher>()
const timers = new Map<string, NodeJS.Timeout>()

function broadcast(plansDir: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('plans:changed', { plansDir })
    }
  }
}

export function ensure(plansDir: string): void {
  if (watchers.has(plansDir)) return
  try {
    mkdirSync(plansDir, { recursive: true })
    const watcher = fsWatch(plansDir, { persistent: false }, () => {
      // Debounce: a single rename/create can fire 2+ events on macOS.
      const prev = timers.get(plansDir)
      if (prev) clearTimeout(prev)
      const t = setTimeout(() => {
        timers.delete(plansDir)
        broadcast(plansDir)
      }, 150)
      timers.set(plansDir, t)
    })
    watcher.on('error', () => {
      watcher.close()
      watchers.delete(plansDir)
    })
    watchers.set(plansDir, watcher)
  } catch {
    // ignore: the directory may not be creatable (read-only fs); we just skip live updates
  }
}

// Close every watcher and cancel pending broadcasts (the quit path).
export function closeAll(): void {
  for (const w of watchers.values()) {
    try {
      w.close()
    } catch {
      // ignore: watcher may already be closed
    }
  }
  watchers.clear()
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}
