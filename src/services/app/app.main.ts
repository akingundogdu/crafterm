import { Channel } from '@services/channels.main'
import { BaseService } from '@services/base.service'
import { join } from 'path'
import { existsSync } from 'fs'
import * as appInfo from '@core/services/app-info/app-info.service'
import * as buildCounter from '@core/services/build-counter/build-counter.service'
import { buildCounterPath } from '@core/services/paths/paths.service'

// App info IPC adapter (app:*): version + build provenance + monotonic build
// counter. Logic lives in @core/services/app-info + @core/services/build-counter.
export class AppController extends BaseService {
  readonly name = 'app'

  register(): void {
    this.handle(Channel.App.Version, () => appInfo.version())
    this.handle(Channel.App.BuildInfo, () => appInfo.buildInfo(join(__dirname, '../build-info.json')))
    this.handle(Channel.App.RepoGit, ({ repoPath }) => appInfo.repoGit(repoPath))

    // Monotonic build counter; the count file is <stateDir>/build-counter.json.
    this.handle(Channel.App.BuildCounter, ({ repoPath }) => {
      const repo = repoPath?.trim()
      if (!repo || !existsSync(repo)) return null
      return buildCounter.getCount(repo, buildCounterPath())
    })
  }
}

