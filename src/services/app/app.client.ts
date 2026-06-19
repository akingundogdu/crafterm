import { call, send, listen, Channel } from '../channels.client'

// App lifecycle / version / self-update / sound / misc IPC.
export const appService = {
  version: () => call(Channel.App.Version),
  buildInfo: () => call(Channel.App.BuildInfo),
  buildCounter: (repoPath: string) => call(Channel.App.BuildCounter, { repoPath }),
  repoGit: (repoPath: string) => call(Channel.App.RepoGit, { repoPath }),
  deployBuild: (repoPath: string, command: string) => call(Channel.Deploy.Build, { repoPath, command }),
  deployKillAllPtys: () => call(Channel.Deploy.KillAllPtys),
  deploySwap: (repoPath: string) => call(Channel.Deploy.Swap, { repoPath }),
  deployWasUpdating: () => call(Channel.Deploy.WasUpdating),
  openExternal: (url: string) => send(Channel.External.Open, { url }),
  notify: (title: string, body: string, paneId?: string) => send(Channel.Notify.Show, { title, body, paneId }),
  monacoTheme: (name: string) => call(Channel.Monaco.Theme, { name }),
  zshCommands: () => call(Channel.Zsh.Commands),
  todoRead: (path?: string) => call(Channel.Todo.Read, { path }),
  todoWrite: (path: string, content: string) => call(Channel.Todo.Write, { path, content }),
  backlogRead: () => call(Channel.Backlog.Read),
  playSound: (name: string) => send(Channel.Sound.Play, { name }),
  playEventSound: (event: 'question' | 'done') => send(Channel.Sound.Event, { event }),
  onAppQuitting: (cb: () => void) => listen(Channel.App.Quitting, () => cb()),
  onFullscreenChange: (cb: (isFullscreen: boolean) => void) =>
    listen(Channel.Window.Fullscreen, (isFull) => cb(isFull)),
  openImproveWindow: () => call(Channel.ImproveWindow.Open),
  improveWindowSetAlwaysOnTop: (value: boolean) =>
    send(Channel.ImproveWindow.SetAlwaysOnTop, { value })
}
