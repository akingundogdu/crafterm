import { ipcMain } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import * as pty from 'node-pty'
import * as terminal from '../services/terminal.manager'

// --- Background processes ("hidden shells"): a PTY that runs a one-shot command
// (e.g. an iOS build/run), keyed by the renderer-supplied stableId. Output is
// buffered in main so a view can attach later and replay it (the PTY lives
// independent of any view; closing a view never kills it). It reuses the same
// pty:data / pty:exit / pty:kill / pty:input channels, keyed by stableId. ---
const procBuffers = new Map<string, string>()
const PROC_BUFFER_CAP = 256 * 1024 // keep the last ~256KB of output for replay

// Terminal bridge (pty:* / proc:*): this is where the renderer reaches the real
// shell, via the Node main process. The implementation lives in
// services/terminal.manager.ts; these thin handlers just wire the IPC channels.
export function registerTerminalIpc(): void {
  ipcMain.handle(
    'pty:create',
    (e, opts: { cwd?: string; env?: Record<string, string>; shell?: string }) =>
      terminal.create(e.sender, opts)
  )

  // A pop-out window adopts an existing pane: its output now flows to that window.
  ipcMain.on('pty:adopt', (e, { id }: { id: string }) => {
    terminal.adopt(id, e.sender)
  })

  ipcMain.on('pty:input', (_e, { id, data }: { id: string; data: string }) => {
    terminal.write(id, data)
  })

  ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    terminal.resize(id, cols, rows)
  })

  ipcMain.on('pty:kill', (_e, { id }: { id: string }) => {
    terminal.kill(id)
    procBuffers.delete(id)
  })

  ipcMain.handle(
    'proc:start',
    (
      e,
      opts: { stableId: string; command: string; cwd?: string; env?: Record<string, string> }
    ) => {
      const id = opts.stableId
      if (terminal.has(id)) return id // already running — don't double-spawn
      terminal.setOwner(id, e.sender)
      const shell = process.env.SHELL || '/bin/zsh'
      let cwd = opts.cwd || homedir()
      if (cwd.startsWith('~')) cwd = join(homedir(), cwd.slice(1))
      if (!existsSync(cwd)) cwd = homedir()
      const env = { ...process.env, ...(opts.env ?? {}), CRAFTERM_PANE_ID: id }
      procBuffers.set(id, '')
      const p = pty.spawn(shell, ['-lc', opts.command], {
        name: 'xterm-256color',
        cols: 120,
        rows: 30,
        cwd,
        env: env as { [key: string]: string }
      })
      p.onData((data) => {
        try {
          const prev = procBuffers.get(id) ?? ''
          const next = (prev + data).slice(-PROC_BUFFER_CAP)
          procBuffers.set(id, next)
          terminal.sendToOwner(id, 'pty:data', { id, data })
        } catch {
          /* renderer gone — never throw back into node-pty */
        }
      })
      p.onExit(({ exitCode }) => {
        try {
          terminal.sendToOwner(id, 'proc:exit', { id, code: exitCode })
        } catch {
          /* teardown race */
        }
        terminal.remove(id) // buffer is kept for replay until the process is dismissed
      })
      terminal.set(id, p)
      return id
    }
  )

  // Replay buffer for an attaching view (the output produced while nothing watched).
  ipcMain.handle('proc:buffer', (_e, { id }: { id: string }) => procBuffers.get(id) ?? '')

  // Re-route a background process's live stream to the window attaching a view.
  ipcMain.on('proc:attach', (e, { id }: { id: string }) => {
    terminal.setOwner(id, e.sender)
  })
}
