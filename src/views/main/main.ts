import '@xterm/xterm/css/xterm.css'
import '@views/styles/tokens.css'
import '@views/components/modal/modal.css'
import '@views/styles/global.css'
import '@views/app-shell/app-shell.css'
import {
  wireHooks,
  wirePaneActions,
  wirePtyStream,
  wireFooterButtons,
  installModalObserver,
  installGlobalKeydown,
  startPolling,
  wireServiceWatchers,
  revealAppShell,
  init
} from './main.store'

// Main-window entry: register all wiring in the same order as before, then boot.
// The handler bodies + session-restore logic live in `main.state.ts`.
revealAppShell()
wireHooks()
wirePaneActions()
wirePtyStream()
wireFooterButtons()
installModalObserver()
installGlobalKeydown()
startPolling()
wireServiceWatchers()

void init()
