import { ipcMain } from 'electron'
import { join } from 'path'
import * as ios from '@core/services/ios.service'
import { scriptsDir } from '@core/services/paths'

// iOS bridge (ios:* / iosWorktree:*): build/run an iOS worktree + list
// targets/schemes. Logic lives in services/ios.service.ts; these handlers
// resolve the bundled ios-worktree.sh path and delegate.
const iosWorktreeScript = (): string => join(scriptsDir(), 'ios-worktree.sh')

export function registerIosIpc(): void {
  // Absolute path to the bundled iOS worktree helper script. The renderer types
  // `bash "<path>" <subcommand>` into a pane (with IOSWT_* env from settings.iosDev),
  // so a build's output streams live in the terminal.
  ipcMain.handle('iosWorktree:scriptPath', () => iosWorktreeScript())

  ipcMain.handle(
    'iosWorktree:report',
    (_e, { repoRoot, cfg }: { repoRoot: string; cfg?: ios.IosCfg }) =>
      ios.report(iosWorktreeScript(), repoRoot, cfg)
  )

  ipcMain.handle(
    'iosWorktree:stop',
    (_e, { worktreePath, cfg }: { worktreePath: string; cfg?: ios.IosCfg }) =>
      ios.stop(iosWorktreeScript(), worktreePath, cfg)
  )

  ipcMain.handle('ios:listTargets', () => ios.listTargets())

  ipcMain.handle('ios:listSchemes', (_e, { repoRoot, cfg }: { repoRoot: string; cfg?: ios.IosCfg }) =>
    ios.listSchemes(repoRoot, cfg)
  )
}
