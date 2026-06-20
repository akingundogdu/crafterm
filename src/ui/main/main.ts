import '@xterm/xterm/css/xterm.css'
import '@ui/styles/tokens.css'
import '@ui/components/modal/modal.css'
import '@ui/styles/global.css'
import '@ui/app-shell/app-shell.css'
import {
  wireHooks,
  wirePaneActions,
  wirePtyStream,
  wireFooterButtons,
  installModalObserver,
  installGlobalKeydown,
  startPolling,
  wireServiceWatchers,
  init
} from './main.state'

// Main-window entry: register all wiring in the same order as before, then boot.
// The handler bodies + session-restore logic live in `main.state.ts`.
wireHooks()
wirePaneActions()
wirePtyStream()
wireFooterButtons()
installModalObserver()
installGlobalKeydown()
startPolling()
wireServiceWatchers()

void init()
