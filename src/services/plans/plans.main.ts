import { handle } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import { readdirSync, statSync } from 'fs'
import * as plansWatcher from '@core/services/plans.watcher'
import { run, gitBin } from '@core/services/exec'
import { parsePlanFilename } from '@core/planFilename'

// Plans bridge (plans:*): Claude plan files (~/.claude/plans), per-project
// docs/plans aggregation, and per-branch plan ownership for the sidebar.
export function registerPlansIpc(): void {
  // List Claude plan files under ~/.claude/plans.
  handle('plans:list', () => {
    const dir = join(homedir(), '.claude', 'plans')
    try {
      return readdirSync(dir)
        .filter((f) => /\.(md|mdx|mdc)$/i.test(f))
        .sort()
        .map((f) => ({ name: f, path: join(dir, f) }))
    } catch {
      return []
    }
  })

  // Aggregate every plan markdown file across the given project paths (each
  // project's <path>/docs/plans dir). Used by the Notebook "Plans" section. Returns
  // newest-first; missing dirs are skipped.
  handle('plans:scan', ({ paths }) => {
    const out: { project: string; name: string; path: string; mtime: number }[] = []
    const seen = new Set<string>()
    for (const p of paths ?? []) {
      if (!p || seen.has(p)) continue
      seen.add(p)
      const dir = join(p, 'docs', 'plans')
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        continue
      }
      const project = p.replace(/\/+$/, '').split('/').pop() || p
      for (const f of entries) {
        if (!/\.(md|mdx|mdc)$/i.test(f)) continue
        const full = join(dir, f)
        let mtime = 0
        try {
          mtime = statSync(full).mtimeMs
        } catch {
          // unreadable entry — still list it, just without a sort key
        }
        out.push({ project, name: f, path: full, mtime })
      }
    }
    out.sort((a, b) => b.mtime - a.mtime)
    return out
  })

  // Plan files for a terminal: <repo>/docs/plans entries that match
  // "<branch>-<slug>--pane-<stableId>.<ext>" or "<branch>-<slug>-<sessionId>.<ext>".
  // Files with neither owner tag are ignored — the sidebar only attributes plans
  // to their producing session, matched on either the pane stableId or the Claude
  // session id. Slashes in the branch are matched as dashes since filenames can't
  // contain "/".
  handle('plans:forBranch', async ({ cwd, branch }) => {
    type PlanRow = {
      name: string
      slug: string
      path: string
      mtime: number
      ownerStableId: string | null
      ownerSessionId: string | null
    }
    if (!cwd || !branch) return [] as PlanRow[]
    let dir = cwd.trim()
    if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
    const root = await run(gitBin(), ['-C', dir, 'rev-parse', '--show-toplevel'])
    if (!root) return [] as PlanRow[]
    const plansDir = join(root.trim(), 'docs', 'plans')
    plansWatcher.ensure(plansDir)
    try {
      const rows: PlanRow[] = []
      for (const f of readdirSync(plansDir).sort()) {
        const parsed = parsePlanFilename(f, branch)
        if (!parsed || (!parsed.ownerStableId && !parsed.ownerSessionId)) continue
        const full = join(plansDir, f)
        let mtime = 0
        try {
          mtime = statSync(full).mtimeMs
        } catch {
          // ignore — file vanished between readdir and stat
        }
        rows.push({
          name: f,
          slug: parsed.slug,
          path: full,
          mtime,
          ownerStableId: parsed.ownerStableId,
          ownerSessionId: parsed.ownerSessionId
        })
      }
      return rows
    } catch {
      return [] as PlanRow[]
    }
  })
}
