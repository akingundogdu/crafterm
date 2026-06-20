import { join } from 'path'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import { loadScript } from '@core/services/scripts/scripts.service'
import { runtimeDir } from '@core/services/paths/paths.service'
import { shq } from '@core/services/exec/exec.service'
import { resolveShell } from '@core/services/shell-resolver/shell-resolver.service'

// IDE domain logic (ide:*): open a path in the user's IDE via their `ide` command.
// No IPC wiring (that's IdeController in ide.main.ts).
export class IdeService {
  // Open a path in the user's IDE via their `ide` command (no terminal spawned).
  open(path: string, ide: string): void {
    if (!path || !existsSync(path)) return
    const cmd = ide && ide.trim() ? ide.trim() : 'open'
    execFile(
      resolveShell(),
      ['-lic', loadScript(join(runtimeDir(), 'templates'), 'ide-open.sh.tmpl', { cmd, path: shq(path) })],
      () => {}
    )
  }
}
