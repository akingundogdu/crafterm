import { shell } from 'electron'
import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { existsSync } from 'fs'

// Shell IPC adapter (shell:*): open/reveal OS paths in the user's file manager.
export class ShellController extends BaseService {
  readonly name = 'shell'

  register(): void {
    // Open a folder (e.g. a terminal's cwd) in the OS file manager.
    this.on(Channel.Shell.OpenPath, ({ path }) => {
      if (path && existsSync(path)) void shell.openPath(path)
    })
    // Reveal an absolute path in Finder (selects the file in its containing folder).
    this.on(Channel.Shell.RevealPath, ({ path }) => {
      if (path && existsSync(path)) shell.showItemInFolder(path)
    })
    this.on(Channel.External.Open, ({ url }) => {
      // only http(s) — never hand arbitrary schemes (file:, etc.) to the OS
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    })
  }
}

