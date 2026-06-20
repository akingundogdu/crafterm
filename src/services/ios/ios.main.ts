import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { join } from 'path'
import * as ios from '@core/services/ios/ios.service'
import { runtimeDir } from '@core/services/paths/paths.service'
import type { IosWorktreeReport } from './ios.types'

// iOS IPC adapter (ios:* / iosWorktree:*): build/run an iOS worktree + list
// targets/schemes. Logic lives in @core/services/ios; this resolves the bundled
// ios-worktree.sh path and delegates (thin enough to need no .service.ts).
export class IosController extends BaseService {
  readonly name = 'ios'

  // Absolute path to the bundled iOS worktree helper script. The renderer types
  // `bash "<path>" <subcommand>` into a pane (with IOSWT_* env from settings.iosDev),
  // so a build's output streams live in the terminal.
  private scriptPath(): string {
    return join(runtimeDir(), 'ios-worktree.sh')
  }

  register(): void {
    this.handle(Channel.IosWorktree.ScriptPath, () => this.scriptPath())
    this.handle(
      Channel.IosWorktree.Report,
      ({ repoRoot, cfg }) =>
        ios.report(this.scriptPath(), repoRoot, cfg) as Promise<IosWorktreeReport | null>
    )
    this.handle(Channel.IosWorktree.Stop, ({ worktreePath, cfg }) =>
      ios.stop(this.scriptPath(), worktreePath, cfg)
    )
    this.handle(Channel.Ios.ListTargets, () => ios.listTargets())
    this.handle(Channel.Ios.ListSchemes, ({ repoRoot, cfg }) => ios.listSchemes(repoRoot, cfg))
  }
}

