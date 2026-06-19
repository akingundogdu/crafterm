import { handle, on } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import * as pty from 'node-pty'
import * as terminal from '@core/services/terminal.manager'

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
  handle('pty:create', (opts, e) => terminal.create(e.sender, opts))

  // A pop-out window adopts an existing pane: its output now flows to that window.
  on('pty:adopt', ({ id }, e) => {
    terminal.adopt(id, e.sender)
  })

  on('pty:input', ({ id, data }) => {
    terminal.write(id, data)
  })

  on('pty:resize', ({ id, cols, rows }) => {
    terminal.resize(id, cols, rows)
  })

  on('pty:kill', ({ id }) => {
    terminal.kill(id)
    procBuffers.delete(id)
  })

  handle('proc:start', (opts, e) => {
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
  })

  // Replay buffer for an attaching view (the output produced while nothing watched).
  handle('proc:buffer', ({ id }) => procBuffers.get(id) ?? '')

  // Re-route a background process's live stream to the window attaching a view.
  on('proc:attach', ({ id }, e) => {
    terminal.setOwner(id, e.sender)
  })
}
