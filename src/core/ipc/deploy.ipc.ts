import { app, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, openSync, rmSync } from 'fs'
import { execFile, spawn } from 'child_process'
import { loadScript } from '../services/scripts'
import * as terminal from '../services/terminal.manager'
import { stateDir, scriptsDir } from '../services/paths'
import { shq } from '../services/exec'
import { APP_NAME } from '../constants'

// Self-update bridge (deploy:*): rebuild the app from its source repo and swap
// the installed /Applications copy. The build runs here (app stays alive so the
// UI can show progress); the swap + relaunch runs as a fully detached process so
// it survives this app quitting.
export function registerDeployIpc(): void {
  ipcMain.handle(
    'deploy:build',
    async (_e, { repoPath, command }: { repoPath: string; command?: string }) => {
      const repo = repoPath?.trim()
      if (!repo || !existsSync(join(repo, 'package.json'))) {
        return { ok: false, error: 'Repo path is not a valid Crafterm checkout (no package.json).' }
      }
      const cmd = (command ?? '').trim() || 'run-crafterm-deploy'
      const log = join(stateDir(), 'deploy.log')
      return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        execFile(
          '/bin/zsh',
          ['-lic', loadScript(join(scriptsDir(), 'templates'), 'deploy-run.sh.tmpl', { cmd, log: shq(log) })],
          { cwd: repo },
          (err) => {
            if (!err) return resolve({ ok: true })
            let tail = ''
            try {
              tail = readFileSync(log, 'utf8').slice(-1500)
            } catch {
              /* ignore */
            }
            resolve({ ok: false, error: tail || err.message })
          }
        )
      })
    }
  )
  ipcMain.handle('deploy:killAllPtys', async () => {
    await terminal.drain()
    return true
  })
  ipcMain.handle('deploy:swap', (_e, { repoPath }: { repoPath: string }) => {
    const repo = repoPath?.trim()
    if (!repo) return false
    const dest = `/Applications/${APP_NAME}.app`
    const log = join(stateDir(), 'deploy.log')
    // Sentinel so the relaunched instance shows the "loading sessions" overlay.
    try {
      writeFileSync(join(stateDir(), '.updating'), String(Date.now()))
    } catch {
      /* ignore */
    }
    const steps = loadScript(join(scriptsDir(), 'templates'), 'self-update.sh.tmpl', {
      appName: shq(APP_NAME),
      distDir: shq(join(repo, 'dist')),
      appBundle: shq(APP_NAME + '.app'),
      dest: shq(dest)
    })
    try {
      const fd = openSync(log, 'a')
      const child = spawn('/bin/zsh', ['-lic', steps], {
        cwd: repo,
        detached: true,
        stdio: ['ignore', fd, fd]
      })
      child.unref()
    } catch {
      return false
    }
    // Give the detached helper a moment to start its wait loop, then quit.
    setTimeout(() => app.quit(), 200)
    return true
  })
  // One-shot: did we just relaunch after an update? Consumes the sentinel.
  ipcMain.handle('deploy:wasUpdating', () => {
    const flag = join(stateDir(), '.updating')
    if (!existsSync(flag)) return false
    try {
      rmSync(flag, { force: true })
    } catch {
      /* ignore */
    }
    return true
  })
}
