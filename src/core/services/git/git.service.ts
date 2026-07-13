import { execFile } from 'child_process'
import { join } from 'path'
import { homedir } from 'os'
import { run, gitBin } from '../exec/exec.service'
import type { GitStatusKind, Worktree } from './git.types'

export async function currentBranch(cwd: string): Promise<string | null> {
  const out = await run('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (!out) return null
  const branch = out.trim()
  return branch && branch !== 'HEAD' ? branch : null
}

// Basename of the toplevel folder, but only when cwd is inside a *linked* git
// worktree (git worktree add ...). Linked worktrees keep their git dir under
// <main>/.git/worktrees/<name>; the main checkout does not. Returns null in the
// main checkout / outside a repo, so the status bar only flags real worktrees.
export async function worktreeName(cwd: string): Promise<string | null> {
  const gitDir = await run('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'])
  if (!gitDir || !gitDir.includes('/worktrees/')) return null
  const out = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])
  if (!out) return null
  const top = out.trim()
  return top ? top.split('/').pop() || null : null
}

// Local branches for the repo at cwd, most-recently-committed first.
export async function branches(cwd: string): Promise<string[]> {
  const out = await run(gitBin(), [
    '-C',
    cwd,
    'branch',
    '--format=%(refname:short)',
    '--sort=-committerdate'
  ])
  if (!out) return []
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

// Git stashes for the repo at cwd: [{ ref: 'stash@{0}', description }].
export async function stashList(cwd: string): Promise<{ ref: string; description: string }[]> {
  const out = await run(gitBin(), ['-C', cwd, 'stash', 'list', '--format=%gd%x00%s'])
  if (!out) return []
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref, description = ''] = line.split('\x00')
      return { ref, description }
    })
}

// Git working-tree status for the Files tree decorations. Returns a map of
// absolute path → change kind, parsed from `git status --porcelain`. Empty map
// outside a repo / on any failure (the established IPC idiom).
export async function fileStatus(cwd?: string): Promise<Record<string, GitStatusKind>> {
  const out: Record<string, GitStatusKind> = {}
  if (!cwd) return out
  const top = await run(gitBin(), ['-C', cwd, 'rev-parse', '--show-toplevel'])
  if (!top) return out
  const root = top.trim()
  const status = await run(gitBin(), [
    '-C',
    root,
    '-c',
    'core.quotePath=false',
    'status',
    '--porcelain'
  ])
  if (!status) return out
  for (const line of status.split('\n')) {
    if (!line) continue
    const code = line.slice(0, 2)
    let rel = line.slice(3)
    // Renames print "old -> new"; decorate the new path.
    const arrow = rel.indexOf(' -> ')
    if (arrow >= 0) rel = rel.slice(arrow + 4)
    let kind: GitStatusKind
    if (code === '??') kind = 'untracked'
    else if (code.includes('A')) kind = 'added'
    else if (code.includes('R')) kind = 'renamed'
    else if (code.includes('D')) kind = 'deleted'
    else kind = 'modified'
    out[join(root, rel)] = kind
  }
  return out
}

export async function listWorktrees(
  cwd?: string
): Promise<{ root: string | null; worktrees: Worktree[] }> {
  let dir = cwd && cwd.trim() ? cwd.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  const git = gitBin()
  const root = await run(git, ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (!root) return { root: null, worktrees: [] }
  const out = await run(git, ['-C', dir, 'worktree', 'list', '--porcelain'])
  const worktrees: Worktree[] = []
  let cur: { path?: string; branch?: string | null } = {}
  for (const line of (out ?? '').split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9) }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '')
    else if (line === 'detached') cur.branch = '(detached)'
    else if (line === '' && cur.path) {
      worktrees.push({ path: cur.path, branch: cur.branch ?? null })
      cur = {}
    }
  }
  if (cur.path) worktrees.push({ path: cur.path, branch: cur.branch ?? null })
  return { root: root.trim(), worktrees }
}

// Create a worktree at `path` for `branch`. The new branch starts off the latest
// remote tip, then tries `-b` (new branch off origin/base) and finally falls
// back to attaching an existing branch. Used by "Run in worktree" (todo6).
export async function worktreeAdd(
  repo: string,
  path: string,
  branch: string,
  base?: string
): Promise<boolean> {
  const git = gitBin()
  const baseRef = base || 'main'
  // Refresh the base from origin so the worktree branches off the latest tip.
  // Best-effort: if fetch fails (offline / no remote), fall back to the local ref.
  const fetched = await new Promise<boolean>((resolve) => {
    execFile(git, ['-C', repo, 'fetch', 'origin', baseRef], { timeout: 120_000 }, (err) => resolve(!err))
  })
  const startPoint = fetched ? `origin/${baseRef}` : baseRef
  return new Promise<boolean>((resolve) => {
    execFile(git, ['-C', repo, 'worktree', 'add', path, '-b', branch, startPoint], { timeout: 120_000 }, (err) => {
      if (!err) return resolve(true)
      // Branch likely already exists — attach it to the new worktree instead.
      execFile(git, ['-C', repo, 'worktree', 'add', path, branch], { timeout: 120_000 }, (e2) => resolve(!e2))
    })
  })
}
