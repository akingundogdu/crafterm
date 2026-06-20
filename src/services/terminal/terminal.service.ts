import type { WebContents } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import * as pty from 'node-pty'
import { Channel } from '@services/channels.main'
import * as terminal from '@core/services/terminal.manager/terminal.manager.service'
import { ENV_NAMES } from '@configs/environment-variables'
import { resolveShell } from '@core/services/shell-resolver/shell-resolver.service'
import type { ProcStartOptions } from '../pty/pty.types'

// Background processes ("hidden shells"): a PTY that runs a one-shot command (e.g.
// an iOS build/run), keyed by the renderer-supplied stableId. Output is buffered in
// main so a view can attach later and replay it (the PTY lives independent of any
// view; closing a view never kills it). It reuses the pty:data / proc:exit channels,
// keyed by stableId. No IPC wiring (that's the TerminalController adapter).
export class TerminalService {
  private readonly procBuffers = new Map<string, string>()
  private readonly PROC_BUFFER_CAP = 256 * 1024 // keep the last ~256KB for replay

  // Spawn a background process for `stableId` (no-op if already running). Streams
  // output to the owning window and keeps a capped replay buffer.
  start(opts: ProcStartOptions, sender: WebContents): string {
    const id = opts.stableId
    if (terminal.has(id)) return id // already running — don't double-spawn
    terminal.setOwner(id, sender)
    const shell = resolveShell()
    let cwd = opts.cwd || homedir()
    if (cwd.startsWith('~')) cwd = join(homedir(), cwd.slice(1))
    if (!existsSync(cwd)) cwd = homedir()
    const env = { ...process.env, ...(opts.env ?? {}), [ENV_NAMES.PaneId]: id }
    this.procBuffers.set(id, '')
    const p = pty.spawn(shell, ['-lc', opts.command], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: env as { [key: string]: string }
    })
    p.onData((data) => {
      try {
        const prev = this.procBuffers.get(id) ?? ''
        const next = (prev + data).slice(-this.PROC_BUFFER_CAP)
        this.procBuffers.set(id, next)
        terminal.sendToOwner(id, Channel.Pty.Data, { id, data })
      } catch {
        /* renderer gone — never throw back into node-pty */
      }
    })
    p.onExit(({ exitCode }) => {
      try {
        terminal.sendToOwner(id, Channel.Proc.Exit, { id, code: exitCode })
      } catch {
        /* teardown race */
      }
      terminal.remove(id) // buffer is kept for replay until the process is dismissed
    })
    terminal.set(id, p)
    return id
  }

  // Replay buffer for an attaching view (output produced while nothing watched).
  buffer(id: string): string {
    return this.procBuffers.get(id) ?? ''
  }

  // Re-route a background process's live stream to the window attaching a view.
  attach(id: string, sender: WebContents): void {
    terminal.setOwner(id, sender)
  }

  // Drop a killed process's replay buffer.
  dropBuffer(id: string): void {
    this.procBuffers.delete(id)
  }
}
