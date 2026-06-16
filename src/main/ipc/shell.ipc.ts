import { ipcMain, shell } from 'electron'
import { existsSync } from 'fs'

// Shell bridge (shell:*): open/reveal OS paths in the user's file manager.
export function registerShellIpc(): void {
  // Open a folder (e.g. a terminal's cwd) in the OS file manager.
  ipcMain.on('shell:openPath', (_e, { path }: { path: string }) => {
    if (path && existsSync(path)) void shell.openPath(path)
  })
  // Reveal an absolute path in Finder (selects the file in its containing folder).
  ipcMain.on('shell:revealPath', (_e, { path }: { path: string }) => {
    if (path && existsSync(path)) shell.showItemInFolder(path)
  })
  ipcMain.on('open-external', (_e, { url }: { url: string }) => {
    // only http(s) — never hand arbitrary schemes (file:, etc.) to the OS
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}
