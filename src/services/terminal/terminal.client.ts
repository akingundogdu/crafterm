import { call, send, listen } from '../channels.client'
import type { PtyCreateOptions, ProcStartOptions } from '../pty/pty.types'

// Terminal/PTY + pop-out + background-process IPC. The only caller of the
// pty:*/popout:*/proc:* channels.
export const terminalService = {
  createPty: (opts: PtyCreateOptions) => call('pty:create', opts),
  input: (id: string, data: string) => send('pty:input', { id, data }),
  resize: (id: string, cols: number, rows: number) => send('pty:resize', { id, cols, rows }),
  kill: (id: string) => send('pty:kill', { id }),
  onData: (cb: (id: string, data: string) => void) => listen('pty:data', (p) => cb(p.id, p.data)),
  onExit: (cb: (id: string) => void) => listen('pty:exit', (p) => cb(p.id)),
  adoptPane: (id: string) => send('pty:adopt', { id }),
  paneInfo: (id: string, stableId?: string) => call('pane:info', { id, stableId }),
  onCloseActivePane: (cb: () => void) => listen('menu:close-pane', () => cb()),
  onFocusPane: (cb: (id: string) => void) => listen('focus-pane', (p) => cb(p.id)),
  popoutOpen: (paneId: string, title?: string) => call('popout:open', { paneId, title }),
  popoutConfirmClose: (id: string) => send('popout:close-confirmed', { id }),
  popoutFocus: (id: string) => send('popout:focus', { id }),
  onPopoutKilled: (cb: (id: string) => void) => listen('popout:killed', (p) => cb(p.id)),
  onPopoutConfirmClose: (cb: (id: string) => void) =>
    listen('popout:confirm-close', (p) => cb(p.id)),
  procStart: (opts: ProcStartOptions) => call('proc:start', opts),
  procBuffer: (id: string) => call('proc:buffer', { id }),
  procAttach: (id: string) => send('proc:attach', { id }),
  onProcExit: (cb: (id: string, code: number) => void) =>
    listen('proc:exit', (p) => cb(p.id, p.code))
}
