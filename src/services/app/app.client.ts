import { Channel } from '../channels.client'
import { BaseClient } from '../base.client'

// App lifecycle / version / external-open / notifications / improve-window IPC.
// Self-update, monaco, zsh, todo, backlog, and sound live in their own clients.
class AppClient extends BaseClient {
  version = () => this.call(Channel.App.Version)
  buildInfo = () => this.call(Channel.App.BuildInfo)
  buildCounter = (repoPath: string) => this.call(Channel.App.BuildCounter, { repoPath })
  repoGit = (repoPath: string) => this.call(Channel.App.RepoGit, { repoPath })
  openExternal = (url: string) => this.send(Channel.External.Open, { url })
  notify = (title: string, body: string, paneId?: string) =>
    this.send(Channel.Notify.Show, { title, body, paneId })
  onAppQuitting = (cb: () => void) => this.listen(Channel.App.Quitting, () => cb())
  onFullscreenChange = (cb: (isFullscreen: boolean) => void) =>
    this.listen(Channel.Window.Fullscreen, (isFull) => cb(isFull))
  openImproveWindow = () => this.call(Channel.ImproveWindow.Open)
  improveWindowSetAlwaysOnTop = (value: boolean) =>
    this.send(Channel.ImproveWindow.SetAlwaysOnTop, { value })
}

export const appService = new AppClient()
