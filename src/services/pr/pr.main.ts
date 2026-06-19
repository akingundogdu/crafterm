import { handle, Channel } from '@services/channels.main'
import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  Gh,
  GhFields,
  PASS_CHECK_STATUSES,
  FAIL_CHECK_STATUSES,
  type PullRequest,
  type PrChecks,
  type WorkflowRun,
  type DeploymentStatus,
  type ProjectPullRequests,
  type ProjectDeployments,
  type RollupItem,
  type PrFileEntry,
  type RawPr,
  type RawRun,
  type RawDeployment,
  type RawDeployStatus
} from './pr.types'

// PR + GitHub Actions/deployments bridge (pr:* / gh:*) over the `gh` CLI. This is
// self-contained gh glue (no reusable model elsewhere), so the helpers live here
// alongside the IPC registration; the shared data shapes are in ./pr.types.

// Resolve the GitHub CLI; GUI-launched apps don't inherit the shell PATH.
function ghBin(): string {
  for (const p of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']) {
    if (existsSync(p)) return p
  }
  return 'gh'
}

// Run an async mapper over items with a fixed concurrency cap, preserving order.
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

function resolveBase(root: string): string {
  let base = root && root.trim() ? root.trim() : ''
  if (base.startsWith('~')) base = join(homedir(), base.slice(1))
  return base
}

// Two-level git-repo scan under `base`. A child that is itself a repo is one
// project; a group folder contributes each of its repo subfolders as
// "group/name".
function scanRepos(base: string): { name: string; path: string }[] {
  const isRepo = (p: string): boolean => existsSync(join(p, '.git'))
  const subdirs = (p: string): { name: string; path: string }[] => {
    try {
      return readdirSync(p, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
        .map((d) => ({ name: d.name, path: join(p, d.name) }))
    } catch {
      return []
    }
  }
  const repos: { name: string; path: string }[] = []
  for (const c of subdirs(base)) {
    if (isRepo(c.path)) repos.push(c)
    else for (const g of subdirs(c.path)) if (isRepo(g.path)) repos.push({ name: `${c.name}/${g.name}`, path: g.path })
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name))
}

// Display name for a repo path relative to the code root (else its basename).
function relName(base: string, p: string): string {
  return base && p.startsWith(base + '/') ? p.slice(base.length + 1) : p.split('/').pop() || p
}

function ghRun(
  args: string[],
  cwd: string,
  timeout = 15000,
  maxBuffer = 8 * 1024 * 1024
): Promise<{ ok: boolean; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(
      ghBin(),
      args,
      { cwd: cwd || undefined, timeout, maxBuffer },
      (error, stdout, stderr) => {
        resolve({ ok: !error, out: stdout ?? '', err: error ? stderr || error.message : '' })
      }
    )
  })
}

// Reconstruct a unified diff from the PR "files" API, which paginates and so
// works past the 300-file cap that fails `gh pr diff`. Each file carries its own
// hunks in `patch`; we prepend the git/path headers our diff parser expects.
function buildPatchFromFiles(json: string): string {
  const arr = JSON.parse(json || '[]') as PrFileEntry[]
  const parts: string[] = []
  for (const f of arr) {
    const oldPath = f.status === 'renamed' && f.previous_filename ? f.previous_filename : f.filename
    parts.push(`diff --git a/${oldPath} b/${f.filename}`)
    parts.push(f.status === 'added' ? '--- /dev/null' : `--- a/${oldPath}`)
    parts.push(f.status === 'removed' ? '+++ /dev/null' : `+++ b/${f.filename}`)
    parts.push(f.patch ?? '@@ no textual diff (binary or too large) @@')
  }
  return parts.join('\n')
}

// Collapse the per-check rollup into pass/fail/pending counts + an overall state.
function summarizeChecks(rollup: RollupItem[] | undefined): PrChecks {
  let pass = 0
  let fail = 0
  let pending = 0
  for (const c of rollup ?? []) {
    const v = (c.conclusion || c.state || c.status || '').toUpperCase()
    if (PASS_CHECK_STATUSES.includes(v)) pass++
    else if (FAIL_CHECK_STATUSES.includes(v)) fail++
    else pending++ // PENDING | QUEUED | IN_PROGRESS | EXPECTED | ''
  }
  const total = pass + fail + pending
  const state = total === 0 ? 'none' : fail > 0 ? 'failure' : pending > 0 ? 'pending' : 'success'
  return { pass, fail, pending, total, state }
}

function shapeRun(r: RawRun): WorkflowRun {
  return {
    id: r.databaseId,
    name: r.name ?? '',
    title: r.displayTitle ?? '',
    status: r.status ?? '', // queued | in_progress | completed
    conclusion: r.conclusion ?? '', // success | failure | cancelled | '' while running
    event: r.event ?? '',
    headBranch: r.headBranch ?? '',
    headSha: r.headSha ?? '',
    url: r.url ?? '',
    createdAt: r.createdAt ?? ''
  }
}

function shapePr(p: RawPr): PullRequest {
  return {
    number: p.number,
    title: p.title,
    headRefName: p.headRefName,
    baseRefName: p.baseRefName,
    state: p.state,
    isDraft: p.isDraft,
    mergeable: p.mergeable, // MERGEABLE | CONFLICTING | UNKNOWN
    reviewDecision: p.reviewDecision, // APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | ''
    url: p.url,
    comments: Array.isArray(p.comments) ? p.comments.length : 0,
    checks: summarizeChecks(p.statusCheckRollup),
    updatedAt: p.updatedAt ?? ''
  }
}

// Recent GitHub Actions workflow runs for the repo at `cwd`, newest first.
async function loadRuns(cwd: string): Promise<{ ok: boolean; error?: string; runs: WorkflowRun[] }> {
  const r = await ghRun([Gh.Sub.Run, Gh.Verb.List, '--limit', '20', '--json', GhFields.Run], cwd)
  if (!r.ok) return { ok: false, error: (r.err || 'gh run list failed').trim(), runs: [] }
  try {
    const arr = JSON.parse(r.out.trim() || '[]') as RawRun[]
    return { ok: true, runs: arr.map(shapeRun) }
  } catch {
    return { ok: false, error: 'failed to parse gh run output', runs: [] }
  }
}

// Latest deployment records for the repo at `cwd`, each with its current status.
// Capped at 10 deployments to bound the per-status API fan-out.
async function loadDeployments(
  cwd: string
): Promise<{ ok: boolean; error?: string; deployments: DeploymentStatus[] }> {
  const repoRes = await ghRun(
    [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
    cwd,
    6000
  )
  const repo = repoRes.out.trim()
  if (!repo) return { ok: false, error: 'Not a GitHub repository (or no remote).', deployments: [] }

  const list = await ghRun([Gh.Sub.Api, `repos/${repo}/deployments?per_page=10`], cwd)
  if (!list.ok) return { ok: false, error: (list.err || 'gh api deployments failed').trim(), deployments: [] }
  let raw: RawDeployment[]
  try {
    raw = JSON.parse(list.out.trim() || '[]') as RawDeployment[]
  } catch {
    return { ok: false, error: 'failed to parse deployments', deployments: [] }
  }

  const deployments: DeploymentStatus[] = await Promise.all(
    raw.map(async (d) => {
      const sres = await ghRun([Gh.Sub.Api, `repos/${repo}/deployments/${d.id}/statuses?per_page=1`], cwd)
      let status: RawDeployStatus = {}
      try {
        const statuses = JSON.parse(sres.out.trim() || '[]') as RawDeployStatus[]
        status = statuses[0] ?? {}
      } catch {
        status = {}
      }
      return {
        id: d.id,
        environment: d.environment ?? '',
        ref: d.ref ?? d.sha ?? '',
        state: status.state ?? 'pending', // pending | in_progress | success | failure | error | inactive
        description: status.description || d.description || '',
        url: status.environment_url || status.log_url || status.target_url || '',
        createdAt: status.created_at || d.created_at || ''
      }
    })
  )
  return { ok: true, deployments }
}

export function registerPrIpc(): void {
  // gh present + authenticated + cwd inside a GitHub repo?
  handle(Channel.Pr.Available, async ({ cwd }) => {
    if (!existsSync(ghBin()) && ghBin() === 'gh') {
      // ghBin() returns 'gh' only when no known path exists; a PATH lookup may
      // still succeed, so fall through to auth check rather than failing here.
    }
    const auth = await ghRun([Gh.Sub.Auth, Gh.Verb.Status], cwd, 6000)
    if (!auth.ok) return { ok: false, error: 'GitHub CLI not authenticated. Run `gh auth login`.' }
    const repo = await ghRun([Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'], cwd, 6000)
    if (!repo.ok || !repo.out.trim())
      return { ok: false, error: 'Not a GitHub repository (or no remote).' }
    return { ok: true, repo: repo.out.trim() }
  })

  // Open PRs for the repo at `cwd`, newest-updated first.
  handle(Channel.Pr.List, async ({ cwd }) => {
    const r = await ghRun([Gh.Sub.Pr, Gh.Verb.List, '--state', 'open', '--limit', '30', '--json', GhFields.Pr], cwd)
    if (!r.ok) return { ok: false, error: (r.err || 'gh pr list failed').trim(), prs: [] }
    try {
      const arr = JSON.parse(r.out.trim() || '[]') as RawPr[]
      return { ok: true, prs: arr.map(shapePr) }
    } catch {
      return { ok: false, error: 'failed to parse gh output', prs: [] }
    }
  })

  // All git repos under the code root (no gh calls) — feeds the project picker.
  handle(Channel.Pr.Repos, ({ root }) => {
    const base = resolveBase(root)
    if (!base) return { ok: false, error: 'Set a Code root in settings.', repos: [] }
    const repos = scanRepos(base)
    if (!repos.length) return { ok: false, error: 'Code root is not readable.', repos: [] }
    return { ok: true, repos }
  })

  // Open PRs for the explicitly selected repo paths, grouped per-project. A
  // selected repo with no open PRs is still returned (empty `prs`) so the user
  // sees every project they chose to track.
  handle(Channel.Pr.ListAll, async ({ root, paths }) => {
    const base = resolveBase(root)
    const sel = (Array.isArray(paths) ? paths : []).filter((p) => existsSync(join(p, '.git')))
    if (!sel.length) return { ok: true, projects: [] }
    const groups: ProjectPullRequests[] = await mapPool(sel, 8, async (p) => {
      const r = await ghRun([Gh.Sub.Pr, Gh.Verb.List, '--state', 'open', '--limit', '30', '--json', GhFields.Pr], p)
      let prs: PullRequest[] = []
      if (r.ok) {
        try {
          prs = (JSON.parse(r.out.trim() || '[]') as RawPr[]).map(shapePr)
        } catch {
          prs = []
        }
      }
      const name = relName(base, p)
      return { name, path: p, repo: name, prs }
    })
    return { ok: true, projects: groups }
  })

  handle(Channel.Pr.Merge, async ({ cwd, number, method }) => {
    const flag = method === 'rebase' ? '--rebase' : method === 'merge' ? '--merge' : '--squash'
    const r = await ghRun([Gh.Sub.Pr, Gh.Verb.Merge, String(number), flag, '--delete-branch'], cwd, 30000)
    return r.ok ? { ok: true } : { ok: false, error: (r.err || 'merge failed').trim() }
  })

  // Full `gh pr view` text for the detail modal.
  handle(Channel.Pr.View, async ({ cwd, number }) => {
    const r = await ghRun([Gh.Sub.Pr, Gh.Verb.View, String(number), '--comments'], cwd)
    return r.ok ? r.out : r.err || 'pr view failed'
  })

  // Unified diff for the in-app diff pane. Try the fast direct diff first; on a
  // large-PR failure (HTTP 406, "diff exceeded the maximum number of files"),
  // fall back to the paginated files API and rebuild the patch ourselves.
  handle(Channel.Pr.Diff, async ({ cwd, number }) => {
    const direct = await ghRun([Gh.Sub.Pr, Gh.Verb.Diff, String(number)], cwd, 30000)
    if (direct.ok && direct.out.trim()) return { ok: true, patch: direct.out }

    const repoRes = await ghRun(
      [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    const repo = repoRes.out.trim()
    if (!repo) return { ok: false, error: (direct.err || 'gh pr diff failed').trim() }

    const files = await ghRun(
      [Gh.Sub.Api, '--paginate', `repos/${repo}/pulls/${number}/files`],
      cwd,
      60000,
      64 * 1024 * 1024
    )
    if (!files.ok)
      return { ok: false, error: (files.err || direct.err || 'gh pr diff failed').trim() }
    try {
      const patch = buildPatchFromFiles(files.out)
      return patch.trim()
        ? { ok: true, patch }
        : { ok: false, error: (direct.err || 'empty diff').trim() }
    } catch {
      return { ok: false, error: (direct.err || 'failed to parse files API').trim() }
    }
  })

  // Post an inline review comment on a contiguous range of new-file lines. The
  // selected rows in the diff pane are always RIGHT-side (added/context) lines,
  // so we anchor to the PR head commit and use start_line/line on the RIGHT.
  handle(Channel.Pr.Comment, async ({ cwd, number, path, startLine, endLine, body }) => {
    if (!body.trim()) return { ok: false, error: 'Comment body is empty.' }
    const repoRes = await ghRun(
      [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    const repo = repoRes.out.trim()
    if (!repo) return { ok: false, error: 'Not a GitHub repository (or no remote).' }
    const shaRes = await ghRun(
      [Gh.Sub.Pr, Gh.Verb.View, String(number), '--json', GhFields.HeadRefOid, '-q', '.headRefOid'],
      cwd,
      10000
    )
    const sha = shaRes.out.trim()
    if (!sha) return { ok: false, error: (shaRes.err || 'failed to resolve PR head commit').trim() }

    const lo = Math.min(startLine, endLine)
    const hi = Math.max(startLine, endLine)
    const args = [
      Gh.Sub.Api,
      '--method',
      'POST',
      `repos/${repo}/pulls/${number}/comments`,
      '-f',
      `body=${body}`,
      '-f',
      `commit_id=${sha}`,
      '-f',
      `path=${path}`,
      '-F',
      `line=${hi}`,
      '-f',
      'side=RIGHT'
    ]
    if (lo !== hi) {
      args.push('-F', `start_line=${lo}`, '-f', 'start_side=RIGHT')
    }
    const r = await ghRun(args, cwd, 20000)
    return r.ok ? { ok: true } : { ok: false, error: (r.err || 'failed to post comment').trim() }
  })

  // Recent GitHub Actions workflow runs for the repo, newest first. Repo-wide
  // (gh has no PR-scoped run list); the renderer keys off headBranch/headSha to
  // associate a run with a merge.
  handle(Channel.Gh.Runs, async ({ cwd }) => loadRuns(cwd))

  // Deployments + workflow runs for the explicitly selected repo paths, grouped
  // per-project (mirror of pr:list-all for the Deployments view).
  handle(Channel.Gh.DeploysAll, async ({ root, paths }) => {
    const base = resolveBase(root)
    const sel = (Array.isArray(paths) ? paths : []).filter((p) => existsSync(join(p, '.git')))
    if (!sel.length) return { ok: true, projects: [] }
    const projects: ProjectDeployments[] = await mapPool(sel, 6, async (p) => {
      const [dep, runs] = await Promise.all([loadDeployments(p), loadRuns(p)])
      return {
        name: relName(base, p),
        path: p,
        deployments: dep.ok ? dep.deployments : [],
        runs: runs.ok ? runs.runs : []
      }
    })
    return { ok: true, projects }
  })

  // Job/step breakdown for one run; fetched lazily when a run card is expanded.
  handle(Channel.Gh.RunJobs, async ({ cwd, id }) => {
    const r = await ghRun([Gh.Sub.Run, Gh.Verb.View, String(id), '--json', GhFields.RunJobs], cwd)
    return r.ok ? r.out : r.err || 'gh run view failed'
  })

  // Latest deployment per recent deployment record, with its current status.
  handle(Channel.Gh.Deployments, async ({ cwd }) => loadDeployments(cwd))
}
