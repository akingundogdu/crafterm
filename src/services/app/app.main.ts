import { ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import * as appInfo from '@core/services/app-info.service'
import * as buildCounter from '@core/services/build-counter.service'
import { buildCounterPath } from '@core/services/paths'

// App info bridge (app:*): version + build provenance + monotonic build counter.
// Logic lives in services/app-info.service.ts + services/build-counter.service.ts.
export function registerAppIpc(): void {
  ipcMain.handle('app:version', () => appInfo.version())
  ipcMain.handle('app:buildInfo', () => appInfo.buildInfo(join(__dirname, '../build-info.json')))
  ipcMain.handle('app:repoGit', (_e, { repoPath }: { repoPath?: string }) => appInfo.repoGit(repoPath))

  // Monotonic build counter; the count file is <stateDir>/build-counter.json.
  ipcMain.handle('app:buildCounter', (_e, { repoPath }: { repoPath?: string }) => {
    const repo = repoPath?.trim()
    if (!repo || !existsSync(repo)) return null
    return buildCounter.getCount(repo, buildCounterPath())
  })
}
