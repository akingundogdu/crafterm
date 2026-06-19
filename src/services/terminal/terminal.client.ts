import { call } from '../_forward'

// Terminal/PTY + pop-out + background-process IPC. The only caller of the
// pty:*/popout:*/proc:* bridge methods.
export const terminalService = {
  createPty: call('terminal', 'createPty'),
  input: call('terminal', 'input'),
  resize: call('terminal', 'resize'),
  kill: call('terminal', 'kill'),
  onData: call('terminal', 'onData'),
  onExit: call('terminal', 'onExit'),
  adoptPane: call('terminal', 'adoptPane'),
  paneInfo: call('terminal', 'paneInfo'),
  onCloseActivePane: call('terminal', 'onCloseActivePane'),
  onFocusPane: call('terminal', 'onFocusPane'),
  popoutOpen: call('terminal', 'popoutOpen'),
  popoutConfirmClose: call('terminal', 'popoutConfirmClose'),
  popoutFocus: call('terminal', 'popoutFocus'),
  onPopoutKilled: call('terminal', 'onPopoutKilled'),
  onPopoutConfirmClose: call('terminal', 'onPopoutConfirmClose'),
  procStart: call('terminal', 'procStart'),
  procBuffer: call('terminal', 'procBuffer'),
  procAttach: call('terminal', 'procAttach'),
  onProcExit: call('terminal', 'onProcExit')
}
