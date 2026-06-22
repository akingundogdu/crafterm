import { execFile } from 'child_process'
import { BIN } from './exec.types'
import { resolveBin } from './exec.utils'

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
