import { execFile } from 'child_process'
import { existsSync } from 'fs'

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

// Resolve a CLI by probing well-known install paths first, since GUI-launched
// apps don't inherit the user's shell PATH. Falls back to the bare name (a PATH
// lookup may still succeed).
function resolveBin(candidates: string[], fallback: string): string {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return fallback
}

export const gitBin = (): string =>
  resolveBin(['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'], 'git')

export const dockerBin = (): string =>
  resolveBin(['/usr/local/bin/docker', '/opt/homebrew/bin/docker', '/usr/bin/docker'], 'docker')

export const ghBin = (): string =>
  resolveBin(['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'], 'gh')

// Fixed-path system binaries — stable /usr locations, no PATH search needed.
export const BIN = {
  lsof: '/usr/sbin/lsof',
  xcrun: '/usr/bin/xcrun',
  security: '/usr/bin/security',
  afplay: '/usr/bin/afplay'
} as const

// Single-quote a string for safe interpolation into a `/bin/zsh -lic '<script>'`
// command line (escapes embedded single quotes).
export function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
