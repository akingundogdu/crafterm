import { handle, Channel } from '@services/channels.main'
import { join } from 'path'
import * as ios from '@core/services/ios.service'
import { runtimeDir } from '@core/services/paths'
import type { IosWorktreeReport } from './ios.types'

// iOS bridge (ios:* / iosWorktree:*): build/run an iOS worktree + list
// targets/schemes. Logic lives in services/ios.service.ts; these handlers
// resolve the bundled ios-worktree.sh path and delegate.
const iosWorktreeScript = (): string => join(runtimeDir(), 'ios-worktree.sh')

export function registerIosIpc(): void {
  // Absolute path to the bundled iOS worktree helper script. The renderer types
  // `bash "<path>" <subcommand>` into a pane (with IOSWT_* env from settings.iosDev),
  // so a build's output streams live in the terminal.
  handle(Channel.IosWorktree.ScriptPath, () => iosWorktreeScript())

  handle(
    Channel.IosWorktree.Report,
    ({ repoRoot, cfg }) =>
      ios.report(iosWorktreeScript(), repoRoot, cfg) as Promise<IosWorktreeReport | null>
  )

  handle(Channel.IosWorktree.Stop, ({ worktreePath, cfg }) =>
    ios.stop(iosWorktreeScript(), worktreePath, cfg)
  )

  handle(Channel.Ios.ListTargets, () => ios.listTargets())

  handle(Channel.Ios.ListSchemes, ({ repoRoot, cfg }) => ios.listSchemes(repoRoot, cfg))
}
