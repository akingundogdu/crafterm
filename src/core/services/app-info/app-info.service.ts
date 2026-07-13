import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { run, gitBin } from '../exec/exec.service'
import type { BuildInfo, RepoGit } from './app-info.types'

// Installed app version (from package.json via Electron).
export function version(): string {
  return app.getVersion()
}

// Git state of the build this running app was packaged from. Written into the
// bundle by scripts/deploy.sh (out/build-info.json) at deploy time. Returns null
// in dev (unpackaged) or when the file is missing — callers then skip the
// "redeploy needed" comparison.
export function buildInfo(buildInfoPath: string): BuildInfo | null {
  if (!app.isPackaged) return null
  try {
    const info = JSON.parse(readFileSync(buildInfoPath, 'utf8'))
    return {
      commit: typeof info.commit === 'string' ? info.commit : null,
      commitCount: typeof info.commitCount === 'number' ? info.commitCount : null
    }
  } catch {
    return null
  }
}

// Live git state of the source repo: current commit, commit count, and whether
// the working tree has uncommitted changes. Lets the renderer flag that the
// running build is behind the repo (redeploy needed). null on any failure.
export async function repoGit(repoPath?: string): Promise<RepoGit | null> {
  const repo = repoPath?.trim()
  if (!repo || !existsSync(repo)) return null
  const gitPath = gitBin()
  const commit = await run(gitPath, ['-C', repo, 'rev-parse', 'HEAD'])
  if (!commit) return null
  const count = await run(gitPath, ['-C', repo, 'rev-list', '--count', 'HEAD'])
  const status = await run(gitPath, ['-C', repo, 'status', '--porcelain'])
  return {
    commit: commit.trim(),
    commitCount: count ? parseInt(count.trim(), 10) || 0 : 0,
    dirty: status !== null && status.trim().length > 0
  }
}
