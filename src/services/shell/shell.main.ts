import { shell } from 'electron'
import { on, Channel } from '@services/channels.main'
import { existsSync } from 'fs'

// Shell bridge (shell:*): open/reveal OS paths in the user's file manager.
export function registerShellIpc(): void {
  // Open a folder (e.g. a terminal's cwd) in the OS file manager.
  on(Channel.Shell.OpenPath, ({ path }) => {
    if (path && existsSync(path)) void shell.openPath(path)
  })
  // Reveal an absolute path in Finder (selects the file in its containing folder).
  on(Channel.Shell.RevealPath, ({ path }) => {
    if (path && existsSync(path)) shell.showItemInFolder(path)
  })
  on(Channel.External.Open, ({ url }) => {
    // only http(s) — never hand arbitrary schemes (file:, etc.) to the OS
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}
