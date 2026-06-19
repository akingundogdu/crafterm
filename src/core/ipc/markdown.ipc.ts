import { ipcMain } from 'electron'
import { join } from 'path'
import { execFile } from 'child_process'
import { loadScript } from '../services/scripts'
import { scriptsDir } from '../services/paths'
import { shq } from '../services/exec'

// Markdown bridge (markdown:*): open a file in the user's Markdown app.
export function registerMarkdownIpc(): void {
  // Open a file in the user's Markdown app via their `markdown` (mdpp) command.
  ipcMain.on('markdown:open', (_e, { path }: { path: string }) => {
    execFile(
      '/bin/zsh',
      ['-lic', loadScript(join(scriptsDir(), 'templates'), 'markdown-open.sh.tmpl', { path: shq(path) })],
      () => {}
    )
  })
}
