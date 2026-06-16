import { call } from './_forward'

// App lifecycle / version / self-update / sound / misc IPC.
export const appService = {
  version: call('app', 'version'),
  buildInfo: call('app', 'buildInfo'),
  buildCounter: call('app', 'buildCounter'),
  repoGit: call('app', 'repoGit'),
  deployBuild: call('app', 'deployBuild'),
  deployKillAllPtys: call('app', 'deployKillAllPtys'),
  deploySwap: call('app', 'deploySwap'),
  deployWasUpdating: call('app', 'deployWasUpdating'),
  openExternal: call('app', 'openExternal'),
  notify: call('app', 'notify'),
  monacoTheme: call('app', 'monacoTheme'),
  zshCommands: call('app', 'zshCommands'),
  todoRead: call('app', 'todoRead'),
  todoWrite: call('app', 'todoWrite'),
  backlogRead: call('app', 'backlogRead'),
  playSound: call('app', 'playSound'),
  playEventSound: call('app', 'playEventSound'),
  onAppQuitting: call('app', 'onAppQuitting'),
  onFullscreenChange: call('app', 'onFullscreenChange'),
  openImproveWindow: call('app', 'openImproveWindow'),
  improveWindowSetAlwaysOnTop: call('app', 'improveWindowSetAlwaysOnTop')
}
