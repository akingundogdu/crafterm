import type { BrowserWindow, WebContents } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import * as pty from 'node-pty'
import { Channel } from '@services/channels'

// Dependencies the manager can't own itself yet: the main window (created in
// index.ts) and the ZDOTDIR shell-integration state (set up alongside the shim).
// Injected via init() so the manager stays free of window/lifecycle concerns.
export interface TerminalManagerDeps {
  getMainWindow: () => BrowserWindow | null
  isShellIntegrationReady: () => boolean
  getZdotDir: () => string
}

// One real PTY (zsh) per terminal pane, keyed by an id we hand back to the renderer.
const ptys = new Map<string, pty.IPty>()
// Which window currently receives a pane's output (main window, or a pop-out).
const owners = new Map<string, WebContents>()
// Open pop-out windows, keyed by the pane id they host.
const popouts = new Map<string, BrowserWindow>()
let seq = 0

let deps: TerminalManagerDeps = {
  getMainWindow: () => null,
  isShellIntegrationReady: () => false,
  getZdotDir: () => ''
}

export function init(d: TerminalManagerDeps): void {
  deps = d
}

// Guard every renderer message: during shutdown a PTY can still emit data/exit
// after the window's webContents is destroyed. A plain `mainWindow?.` check is
// not enough — the object is destroyed but not null — so `.send()` would throw
// "Object has been destroyed" (one uncaught exception, i.e. one dialog, per PTY).
export function sendToRenderer(channel: string, payload: unknown): void {
  const mainWindow = deps.getMainWindow()
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// Route a pane's stream to the window that currently owns it (a pop-out window,
// or the main window by default). Same destroyed-guards as sendToRenderer.
export function sendToOwner(id: string, channel: string, payload: unknown): void {
  const wc = owners.get(id)
  if (wc && !wc.isDestroyed()) {
    wc.send(channel, payload)
    return
  }
  sendToRenderer(channel, payload)
}

// --- PTY bridge: this is where "web" reaches the real shell, via the Node main process ---

export function create(
  sender: WebContents,
  opts: { cwd?: string; env?: Record<string, string>; shell?: string }
): string {
  const id = String(++seq)
  owners.set(id, sender) // the window that created it receives its output
  const shell = opts?.shell || process.env.SHELL || '/bin/zsh'
  let cwd = opts?.cwd || homedir()
  if (cwd.startsWith('~')) cwd = join(homedir(), cwd.slice(1))
  if (!existsSync(cwd)) cwd = homedir() // fall back if the saved path is gone
  // Renderer-supplied env wins over the inherited environment so that
  // CRAFTERM_PANE_ID always reflects the pane that owns this PTY.
  const env = { ...process.env, ...(opts?.env ?? {}) }
  if (opts?.env?.CRAFTERM_PANE_ID) env.CRAFTERM_PANE_ID = opts.env.CRAFTERM_PANE_ID
  // Route zsh through our ZDOTDIR shim so a preexec hook records the last
  // command for this pane (restored as pre-typed text). USER_ZDOTDIR points the
  // shim at the user's real rc dir so their config still loads.
  if (deps.isShellIntegrationReady() && /zsh/.test(shell)) {
    env.USER_ZDOTDIR = process.env.ZDOTDIR || homedir()
    env.ZDOTDIR = deps.getZdotDir()
  }
  const p = pty.spawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: env as { [key: string]: string }
  })

  // Both callbacks are invoked by node-pty through a native ThreadSafeFunction.
  // A throw escaping here (e.g. webContents.send() on a disposed frame during
  // shutdown) is turned into an uncatchable C++ exception by node-pty and
  // aborts the whole process — it does NOT route through `uncaughtException`.
  // So every callback body must be wrapped to never throw back into native code.
  p.onData((data) => {
    try {
      sendToOwner(id, Channel.Pty.Data, { id, data })
    } catch {
      /* renderer gone / frame disposed — never let it reach node-pty */
    }
  })
  p.onExit(() => {
    try {
      sendToOwner(id, Channel.Pty.Exit, { id })
    } catch {
      /* ignore: same teardown race as above */
    }
    ptys.delete(id)
    owners.delete(id)
  })

  ptys.set(id, p)
  return id
}

// A pop-out window adopts an existing pane: its output now flows to that window.
export function adopt(id: string, sender: WebContents): void {
  if (ptys.has(id)) owners.set(id, sender)
}

export function write(id: string, data: string): void {
  ptys.get(id)?.write(data)
}

export function resize(id: string, cols: number, rows: number): void {
  try {
    ptys.get(id)?.resize(cols, rows)
  } catch {
    /* resize can throw if the pty just died — safe to ignore */
  }
}

export function kill(id: string): void {
  ptys.get(id)?.kill()
  ptys.delete(id)
  owners.delete(id)
}

// --- Accessors for callers still living in index.ts (background processes,
// pop-out windows, pane:info/git handlers) until their own phases migrate. ---
export function get(id: string): pty.IPty | undefined {
  return ptys.get(id)
}

export function has(id: string): boolean {
  return ptys.has(id)
}

export function set(id: string, p: pty.IPty): void {
  ptys.set(id, p)
}

export function remove(id: string): void {
  ptys.delete(id)
}

export function setOwner(id: string, wc: WebContents): void {
  owners.set(id, wc)
}

export function deleteOwner(id: string): void {
  owners.delete(id)
}

export function count(): number {
  return ptys.size
}

export function getPopout(id: string): BrowserWindow | undefined {
  return popouts.get(id)
}

export function setPopout(id: string, win: BrowserWindow): void {
  popouts.set(id, win)
}

export function deletePopout(id: string): void {
  popouts.delete(id)
}

// Kill every live PTY and wait for each one to ACTUALLY exit. This is the fix
// for the update-restart crash: if PTYs are killed inside `before-quit` and the
// handler returns immediately (while the Node environment then tears down),
// node-pty's exit callbacks race the teardown and abort() the process via an
// uncaught ThreadSafeFunction throw. Draining first — waiting for each onExit to
// fire and remove the pty from `ptys` — leaves nothing to fire during teardown.
// A child that ignores SIGHUP (e.g. a running claude/vim) is escalated to
// SIGKILL after 5s so quitting/updating can't hang. Used both by the in-app
// update flow and by `before-quit`, so EVERY quit path (Cmd+Q, the deploy
// script's `osascript quit`, …) drains safely.
export async function drain(): Promise<void> {
  const entries = [...ptys.values()]
  if (entries.length === 0) return
  await Promise.all(
    entries.map(
      (p) =>
        new Promise<void>((resolve) => {
          let done = false
          let timer: NodeJS.Timeout | undefined
          const finish = () => {
            if (done) return
            done = true
            clearTimeout(timer)
            resolve()
          }
          // onExit already removes the pty from `ptys`; we just await it here.
          try {
            p.onExit(finish)
          } catch {
            finish()
            return
          }
          timer = setTimeout(() => {
            try {
              p.kill('SIGKILL')
            } catch {
              /* already gone */
            }
            // Give the forced kill a brief moment to fire onExit, then resolve.
            setTimeout(finish, 250)
          }, 5000)
          try {
            p.kill()
          } catch {
            finish()
          }
        })
    )
  )
}
