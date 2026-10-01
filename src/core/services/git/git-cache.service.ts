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

// Bounded so a long session that visits many directories cannot grow the cache
// without limit. Map keeps insertion order, so the oldest key is first; evicting it
// is a cheap LRU-ish bound (re-set on hit below keeps hot cwds from being evicted).
const CACHE_CAP = 256
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
  // Re-resolve the HEAD path each call — it is a spawn-free fs walk, and doing so
  // picks up a `git init` that turned a non-repo cwd into a repo.
  const headPath = resolveHeadPath(cwd)
  // No repo here (headPath null → mtime 0): there is nothing for git to report, so
  // skip the two spawns entirely instead of running them every tick for a null
  // result — that per-tick spawn was exactly what this cache exists to remove.
  if (!headPath) {
    cache.delete(cwd)
    return { branch: null, worktree: null }
  }
  const mtime = headMtime(headPath)
  if (cached && cached.headPath === headPath && cached.headMtimeMs === mtime && mtime !== 0) {
    cache.delete(cwd)
    cache.set(cwd, cached) // mark as most-recently-used
    return { branch: cached.branch, worktree: cached.worktree }
  }
  const [branch, worktree] = await Promise.all([git.currentBranch(cwd), git.worktreeName(cwd)])
  cache.set(cwd, { branch, worktree, headPath, headMtimeMs: mtime })
  if (cache.size > CACHE_CAP) cache.delete(cache.keys().next().value as string)
  return { branch, worktree }
}

// Test seam.
export function clearGitCache(): void {
  cache.clear()
}
