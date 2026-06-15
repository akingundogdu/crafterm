import { call } from './_forward'

// Terminal/PTY + pop-out + background-process IPC. The only caller of the
// pty:*/popout:*/proc:* bridge methods.
export const terminalService = {
  createPty: call('createPty'),
  input: call('input'),
  resize: call('resize'),
  kill: call('kill'),
  onData: call('onData'),
  onExit: call('onExit'),
  adoptPane: call('adoptPane'),
  paneInfo: call('paneInfo'),
  onCloseActivePane: call('onCloseActivePane'),
  onFocusPane: call('onFocusPane'),
  popoutOpen: call('popoutOpen'),
  popoutConfirmClose: call('popoutConfirmClose'),
  popoutFocus: call('popoutFocus'),
  onPopoutKilled: call('onPopoutKilled'),
  onPopoutConfirmClose: call('onPopoutConfirmClose'),
  procStart: call('procStart'),
  procBuffer: call('procBuffer'),
  procAttach: call('procAttach'),
  onProcExit: call('onProcExit')
}
