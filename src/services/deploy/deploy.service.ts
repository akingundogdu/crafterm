import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, openSync, rmSync } from 'fs'
import { execFile, spawn } from 'child_process'
import { loadScript } from '@core/services/scripts/scripts.service'
import * as terminal from '@core/services/terminal.manager/terminal.manager.service'
import { stateDir, runtimeDir } from '@core/services/paths/paths.service'
import { shq } from '@core/services/exec/exec.service'
import { resolveShell } from '@core/services/shell-resolver/shell-resolver.service'
import { APP_NAME } from '@core/constants/constants'
import type { DeployResult } from './deploy.types'

// Self-update domain logic (deploy:*): rebuild the app from its source repo and
// swap the installed /Applications copy. The build runs in-process (app stays alive
// so the UI can show progress); the swap + relaunch runs as a fully detached
// process so it survives this app quitting. No IPC wiring (see deploy.main.ts).
export class DeployService {
  async build(repoPath: string, command: string): Promise<DeployResult> {
    const repo = repoPath?.trim()
    if (!repo || !existsSync(join(repo, 'package.json'))) {
      return { ok: false, error: 'Repo path is not a valid Crafterm checkout (no package.json).' }
    }
    const cmd = (command ?? '').trim() || 'run-crafterm-deploy'
    const log = join(stateDir(), 'deploy.log')
    return await new Promise<DeployResult>((resolve) => {
      execFile(
        resolveShell(),
        ['-lic', loadScript(join(runtimeDir(), 'templates'), 'deploy-run.sh.tmpl', { cmd, log: shq(log) })],
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

  async killAllPtys(): Promise<boolean> {
    await terminal.drain()
    return true
  }

  swap(repoPath: string): boolean {
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
    const steps = loadScript(join(runtimeDir(), 'templates'), 'self-update.sh.tmpl', {
      appName: shq(APP_NAME),
      distDir: shq(join(repo, 'dist')),
      appBundle: shq(APP_NAME + '.app'),
      dest: shq(dest)
    })
    try {
      const fd = openSync(log, 'a')
      const child = spawn(resolveShell(), ['-lic', steps], {
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
  }

  // One-shot: did we just relaunch after an update? Consumes the sentinel.
  wasUpdating(): boolean {
    const flag = join(stateDir(), '.updating')
    if (!existsSync(flag)) return false
    try {
      rmSync(flag, { force: true })
    } catch {
      /* ignore */
    }
    return true
  }
}
