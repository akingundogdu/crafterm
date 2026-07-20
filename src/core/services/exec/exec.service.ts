import { execFile, execFileSync } from 'child_process'
import { BIN } from './exec.types'
import {
  resolveBin,
  isBarePath,
  mergePath,
  extractMarkedPath,
  PATH_MARKER_START,
  PATH_MARKER_END
} from './exec.utils'

// Replace the bare PATH a GUI launch inherits with the user's real one, resolved
// once from a login shell. Every execFile below — and every process they spawn in
// turn — then sees it, so git can find git-lfs during a worktree checkout instead
// of dying with "git-lfs: command not found".
//
// Synchronous on purpose: it runs before any service registers, so nothing can
// spawn against the bare PATH. Costs ~200ms, and only on a GUI launch — a PATH
// inherited from a shell is left alone. Non-interactive (-lc) reads .zshenv +
// .zprofile, where PATH belongs; -lic would add ~1.5s of .zshrc for no PATH we
// need here.
export function hydrateEnvPath(): void {
  const current = process.env.PATH ?? ''
  if (!isBarePath(current)) return
  try {
    const out = execFileSync(
      '/bin/zsh',
      ['-lc', `echo "${PATH_MARKER_START}\${PATH}${PATH_MARKER_END}"`],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
    )
    const discovered = extractMarkedPath(out)
    if (!discovered) return
    const merged = mergePath(current, discovered)
    if (merged) process.env.PATH = merged
  } catch {
    // Keep the inherited PATH: resolveBin() still probes absolute install paths,
    // so a failed probe degrades to today's behaviour rather than breaking startup.
  }
}

// Run a command and capture stdout. Resolves null on any error / non-zero exit.
// 2s timeout — these back quick metadata queries (git, lsof), not long jobs.
export function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 2000 }, (err, stdout) => {
      resolve(err ? null : stdout)
    })
  })
}

export async function paneCwd(pid: number): Promise<string | null> {
  // -d cwd limits to the cwd descriptor; -Fn prints machine-readable lines, the
  // 'n' line holds the path. Works without any shell configuration.
  const out = await run(BIN.lsof, ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'])
  if (!out) return null
  const line = out.split('\n').find((l) => l.startsWith('n'))
  return line ? line.slice(1) : null
}

export const gitBin = (): string =>
  resolveBin(['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'], 'git')

// `CRAFTERM_DOCKER_BIN` / `CRAFTERM_GH_BIN` override the resolved binary for test
// isolation (a stub script emitting canned output) — `resolveBin` probes absolute
// install paths first, so a bare PATH stub is unreliable; the env override is not.
export const dockerBin = (): string =>
  process.env.CRAFTERM_DOCKER_BIN || resolveBin(['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker'], 'docker')

export const ghBin = (): string =>
  process.env.CRAFTERM_GH_BIN || resolveBin(['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'], 'gh')

// Single-quote a string for safe interpolation into a `/bin/zsh -lic '<script>'`
// command line (escapes embedded single quotes).
export function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
