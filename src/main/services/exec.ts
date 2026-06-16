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
  const out = await run('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'])
  if (!out) return null
  const line = out.split('\n').find((l) => l.startsWith('n'))
  return line ? line.slice(1) : null
}

export function gitBin(): string {
  for (const p of ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']) {
    if (existsSync(p)) return p
  }
  return 'git'
}

// Single-quote a string for safe interpolation into a `/bin/zsh -lic '<script>'`
// command line (escapes embedded single quotes).
export function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}
