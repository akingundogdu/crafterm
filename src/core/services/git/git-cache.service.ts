import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import * as git from './git.service'

// Per-cwd cache of the two git facts the pane poll reads every tick — branch and
// linked-worktree name. Both change only when the repo's HEAD moves, so the cache
// is keyed by cwd and invalidated by the mtime of the resolved HEAD file. A tick
// where nothing moved then costs one stat() instead of three `git rev-parse`
// spawns per pane — which, at ~38 panes every few seconds, was the bulk of the
// child-process storm that starved the main process (and with it keystroke echo).

interface GitFacts {
  branch: string | null
  worktree: string | null
}

interface CacheEntry extends GitFacts {
  headPath: string | null // resolved .git/HEAD, or null when cwd is not in a repo
  headMtimeMs: number
}

const cache = new Map<string, CacheEntry>()

// Resolve the HEAD file that moves when this cwd's branch changes, WITHOUT a spawn.
// Walk up from cwd: a directory `.git` is a normal checkout (HEAD sits inside it);
// a `.git` FILE is a linked worktree whose `gitdir:` line points at the real git
// dir, and that dir holds this worktree's own HEAD. Returns null outside a repo.
function resolveHeadPath(cwd: string): string | null {
  let dir = cwd
  for (let depth = 0; depth < 64; depth++) {
    const dotGit = join(dir, '.git')
    try {
      if (existsSync(dotGit)) {
        const st = statSync(dotGit)
        if (st.isDirectory()) return join(dotGit, 'HEAD')
        if (st.isFile()) {
          const line = readFileSync(dotGit, 'utf8').trim()
          const m = /^gitdir:\s*(.+)$/.exec(line)
          if (m) {
            const gitDir = m[1].startsWith('/') ? m[1] : join(dir, m[1])
            return join(gitDir, 'HEAD')
          }
        }
      }
    } catch {
      // unreadable entry — treat as "not the git dir" and keep walking up
    }
    const parent = join(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

function headMtime(headPath: string | null): number {
  if (!headPath) return 0
  try {
    return statSync(headPath).mtimeMs
  } catch {
    return 0
  }
}

// Branch + worktree for cwd, served from cache when HEAD has not moved since the
// last lookup. Falls back to the live git calls (and refreshes the cache) on a
// miss or when HEAD's mtime changed.
export async function facts(cwd: string): Promise<GitFacts> {
  const cached = cache.get(cwd)
  const headPath = cached?.headPath ?? resolveHeadPath(cwd)
  const mtime = headMtime(headPath)
  if (cached && cached.headPath === headPath && cached.headMtimeMs === mtime && mtime !== 0) {
    return { branch: cached.branch, worktree: cached.worktree }
  }
  const [branch, worktree] = await Promise.all([git.currentBranch(cwd), git.worktreeName(cwd)])
  cache.set(cwd, { branch, worktree, headPath, headMtimeMs: mtime })
  return { branch, worktree }
}

// Test seam.
export function clearGitCache(): void {
  cache.clear()
}
