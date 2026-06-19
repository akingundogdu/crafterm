import { handle, Channel } from '@services/channels.main'
import { join } from 'path'
import { existsSync } from 'fs'
import * as appInfo from '@core/services/app-info.service'
import * as buildCounter from '@core/services/build-counter.service'
import { buildCounterPath } from '@core/services/paths'

// App info bridge (app:*): version + build provenance + monotonic build counter.
// Logic lives in services/app-info.service.ts + services/build-counter.service.ts.
export function registerAppIpc(): void {
  handle(Channel.App.Version, () => appInfo.version())
  handle(Channel.App.BuildInfo, () => appInfo.buildInfo(join(__dirname, '../build-info.json')))
  handle(Channel.App.RepoGit, ({ repoPath }) => appInfo.repoGit(repoPath))

  // Monotonic build counter; the count file is <stateDir>/build-counter.json.
  handle(Channel.App.BuildCounter, ({ repoPath }) => {
    const repo = repoPath?.trim()
    if (!repo || !existsSync(repo)) return null
    return buildCounter.getCount(repo, buildCounterPath())
  })
}
