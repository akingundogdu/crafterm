import { on } from '@services/channels.main'
import { join } from 'path'
import { execFile } from 'child_process'
import { loadScript } from '@core/services/scripts'
import { scriptsDir } from '@core/services/paths'
import { shq } from '@core/services/exec'

// Markdown bridge (markdown:*): open a file in the user's Markdown app.
export function registerMarkdownIpc(): void {
  // Open a file in the user's Markdown app via their `markdown` (mdpp) command.
  on('markdown:open', ({ path }) => {
    execFile(
      '/bin/zsh',
      ['-lic', loadScript(join(scriptsDir(), 'templates'), 'markdown-open.sh.tmpl', { path: shq(path) })],
      () => {}
    )
  })
}
