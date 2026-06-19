import { call, send, listen, Channel } from '../channels.client'
import type { PtyCreateOptions, ProcStartOptions } from '../pty/pty.types'

// Terminal/PTY + pop-out + background-process IPC. The only caller of the
// pty:*/popout:*/proc:* channels.
export const terminalService = {
  createPty: (opts: PtyCreateOptions) => call(Channel.Pty.Create, opts),
  input: (id: string, data: string) => send(Channel.Pty.Input, { id, data }),
  resize: (id: string, cols: number, rows: number) => send(Channel.Pty.Resize, { id, cols, rows }),
  kill: (id: string) => send(Channel.Pty.Kill, { id }),
  onData: (cb: (id: string, data: string) => void) => listen(Channel.Pty.Data, (p) => cb(p.id, p.data)),
  onExit: (cb: (id: string) => void) => listen(Channel.Pty.Exit, (p) => cb(p.id)),
  adoptPane: (id: string) => send(Channel.Pty.Adopt, { id }),
  paneInfo: (id: string, stableId?: string) => call(Channel.Pane.Info, { id, stableId }),
  onCloseActivePane: (cb: () => void) => listen(Channel.Menu.ClosePane, () => cb()),
  onFocusPane: (cb: (id: string) => void) => listen(Channel.Pane.Focus, (p) => cb(p.id)),
  popoutOpen: (paneId: string, title?: string) => call(Channel.Popout.Open, { paneId, title }),
  popoutConfirmClose: (id: string) => send(Channel.Popout.CloseConfirmed, { id }),
  popoutFocus: (id: string) => send(Channel.Popout.Focus, { id }),
  onPopoutKilled: (cb: (id: string) => void) => listen(Channel.Popout.Killed, (p) => cb(p.id)),
  onPopoutConfirmClose: (cb: (id: string) => void) =>
    listen(Channel.Popout.ConfirmClose, (p) => cb(p.id)),
  procStart: (opts: ProcStartOptions) => call(Channel.Proc.Start, opts),
  procBuffer: (id: string) => call(Channel.Proc.Buffer, { id }),
  procAttach: (id: string) => send(Channel.Proc.Attach, { id }),
  onProcExit: (cb: (id: string, code: number) => void) =>
    listen(Channel.Proc.Exit, (p) => cb(p.id, p.code))
}
