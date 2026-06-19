import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { loadScript } from '../services/scripts'
import { scriptsDir } from '../services/paths'
import { shq } from '../services/exec'

// IDE bridge (ide:*): open a path in the user's IDE via their `ide` command.
export function registerIdeIpc(): void {
  // Open a path in the user's IDE via their `ide` command (no terminal spawned).
  ipcMain.on('ide:open', (_e, { path, ide }: { path: string; ide: string }) => {
    if (!path || !existsSync(path)) return
    const cmd = ide && ide.trim() ? ide.trim() : 'open'
    execFile(
      '/bin/zsh',
      ['-lic', loadScript(join(scriptsDir(), 'templates'), 'ide-open.sh.tmpl', { cmd, path: shq(path) })],
      () => {}
    )
  })
}
