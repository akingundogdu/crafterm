import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'
import type { PtyCreateOptions, ProcStartOptions } from '../pty/pty.types'

// Terminal/PTY + pop-out + background-process IPC. The only caller of the
// pty:*/popout:*/proc:* channels.
class TerminalClient extends BaseClient {
  createPty = (opts: PtyCreateOptions) => this.call(Channel.Pty.Create, opts)
  input = (id: string, data: string) => this.send(Channel.Pty.Input, { id, data })
  resize = (id: string, cols: number, rows: number) => this.send(Channel.Pty.Resize, { id, cols, rows })
  kill = (id: string) => this.send(Channel.Pty.Kill, { id })
  onData = (cb: (id: string, data: string) => void) => this.listen(Channel.Pty.Data, (p) => cb(p.id, p.data))
  onExit = (cb: (id: string) => void) => this.listen(Channel.Pty.Exit, (p) => cb(p.id))
  adoptPane = (id: string) => this.send(Channel.Pty.Adopt, { id })
  onCloseActivePane = (cb: () => void) => this.listen(Channel.Menu.ClosePane, () => cb())
  popoutOpen = (paneId: string, title?: string) => this.call(Channel.Popout.Open, { paneId, title })
  popoutConfirmClose = (id: string) => this.send(Channel.Popout.CloseConfirmed, { id })
  popoutFocus = (id: string) => this.send(Channel.Popout.Focus, { id })
  onPopoutKilled = (cb: (id: string) => void) => this.listen(Channel.Popout.Killed, (p) => cb(p.id))
  onPopoutConfirmClose = (cb: (id: string) => void) =>
    this.listen(Channel.Popout.ConfirmClose, (p) => cb(p.id))
  procStart = (opts: ProcStartOptions) => this.call(Channel.Proc.Start, opts)
  procBuffer = (id: string) => this.call(Channel.Proc.Buffer, { id })
  procAttach = (id: string) => this.send(Channel.Proc.Attach, { id })
  onProcExit = (cb: (id: string, code: number) => void) =>
    this.listen(Channel.Proc.Exit, (p) => cb(p.id, p.code))
}

export const terminalService = new TerminalClient()
