import { handle } from '@services/channels.main'
import { join } from 'path'
import { existsSync } from 'fs'
import * as appInfo from '@core/services/app-info.service'
import * as buildCounter from '@core/services/build-counter.service'
import { buildCounterPath } from '@core/services/paths'

// App info bridge (app:*): version + build provenance + monotonic build counter.
// Logic lives in services/app-info.service.ts + services/build-counter.service.ts.
export function registerAppIpc(): void {
  handle('app:version', () => appInfo.version())
  handle('app:buildInfo', () => appInfo.buildInfo(join(__dirname, '../build-info.json')))
  handle('app:repoGit', ({ repoPath }) => appInfo.repoGit(repoPath))

  // Monotonic build counter; the count file is <stateDir>/build-counter.json.
  handle('app:buildCounter', ({ repoPath }) => {
    const repo = repoPath?.trim()
    if (!repo || !existsSync(repo)) return null
    return buildCounter.getCount(repo, buildCounterPath())
  })
}
