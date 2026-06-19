import { call, send, listen } from '../channels.client'

// App lifecycle / version / self-update / sound / misc IPC.
export const appService = {
  version: () => call('app:version'),
  buildInfo: () => call('app:buildInfo'),
  buildCounter: (repoPath: string) => call('app:buildCounter', { repoPath }),
  repoGit: (repoPath: string) => call('app:repoGit', { repoPath }),
  deployBuild: (repoPath: string, command: string) => call('deploy:build', { repoPath, command }),
  deployKillAllPtys: () => call('deploy:killAllPtys'),
  deploySwap: (repoPath: string) => call('deploy:swap', { repoPath }),
  deployWasUpdating: () => call('deploy:wasUpdating'),
  openExternal: (url: string) => send('open-external', { url }),
  notify: (title: string, body: string, paneId?: string) => send('notify', { title, body, paneId }),
  monacoTheme: (name: string) => call('monaco:theme', { name }),
  zshCommands: () => call('zsh:commands'),
  todoRead: (path?: string) => call('todo:read', { path }),
  todoWrite: (path: string, content: string) => call('todo:write', { path, content }),
  backlogRead: () => call('backlog:read'),
  playSound: (name: string) => send('sound:play', { name }),
  playEventSound: (event: 'question' | 'done') => send('sound:event', { event }),
  onAppQuitting: (cb: () => void) => listen('app:quitting', () => cb()),
  onFullscreenChange: (cb: (isFullscreen: boolean) => void) =>
    listen('window:fullscreen', (isFull) => cb(isFull)),
  openImproveWindow: () => call('improve-window:open'),
  improveWindowSetAlwaysOnTop: (value: boolean) =>
    send('improve-window:set-always-on-top', { value })
}
