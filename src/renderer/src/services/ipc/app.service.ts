import { call } from './_forward'

// App lifecycle / version / self-update / sound / misc IPC.
export const appService = {
  version: call('appVersion'),
  buildInfo: call('appBuildInfo'),
  buildCounter: call('appBuildCounter'),
  repoGit: call('repoGit'),
  deployBuild: call('deployBuild'),
  deployKillAllPtys: call('deployKillAllPtys'),
  deploySwap: call('deploySwap'),
  deployWasUpdating: call('deployWasUpdating'),
  openExternal: call('openExternal'),
  notify: call('notify'),
  monacoTheme: call('monacoTheme'),
  zshCommands: call('zshCommands'),
  todoRead: call('todoRead'),
  todoWrite: call('todoWrite'),
  backlogRead: call('backlogRead'),
  playSound: call('playSound'),
  playEventSound: call('playEventSound'),
  onAppQuitting: call('onAppQuitting'),
  onFullscreenChange: call('onFullscreenChange'),
  openImproveWindow: call('openImproveWindow'),
  improveWindowSetAlwaysOnTop: call('improveWindowSetAlwaysOnTop')
}
