import { shell } from 'electron'
import { on } from '@services/channels.main'
import { existsSync } from 'fs'

// Shell bridge (shell:*): open/reveal OS paths in the user's file manager.
export function registerShellIpc(): void {
  // Open a folder (e.g. a terminal's cwd) in the OS file manager.
  on('shell:openPath', ({ path }) => {
    if (path && existsSync(path)) void shell.openPath(path)
  })
  // Reveal an absolute path in Finder (selects the file in its containing folder).
  on('shell:revealPath', ({ path }) => {
    if (path && existsSync(path)) shell.showItemInFolder(path)
  })
  on('open-external', ({ url }) => {
    // only http(s) — never hand arbitrary schemes (file:, etc.) to the OS
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}
