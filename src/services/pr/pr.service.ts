import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { ghBin } from '@core/services/exec/exec.service'
import {
  Gh,
  GhFields,
  type PullRequest,
  type WorkflowRun,
  type DeploymentStatus,
  type ProjectPullRequests,
  type ProjectDeployments,
  type RawPr,
  type RawRun,
  type RawDeployment,
  type RawDeployStatus
} from './pr.types'
import {
  mapPool,
  resolveBase,
  scanRepos,
  relName,
  buildPatchFromFiles,
  shapeRun,
  shapePr
} from './pr.utils'

// PR + GitHub Actions/deployments domain logic (pr:* / gh:*) over the `gh` CLI.
// gh-call orchestration; pure data shapers + scanners live in ./pr.utils, shared
// shapes in ./pr.types. No IPC wiring (that's the PrController in pr.main.ts).
export class PrService {
  private ghRun(
    args: string[],
    cwd: string,
    timeout = 15000,
    maxBuffer = 8 * 1024 * 1024
  ): Promise<{ ok: boolean; out: string; err: string }> {
    return new Promise((resolve) => {
      execFile(ghBin(), args, { cwd: cwd || undefined, timeout, maxBuffer }, (error, stdout, stderr) => {
        resolve({ ok: !error, out: stdout ?? '', err: error ? stderr || error.message : '' })
      })
    })
  }

  // Recent GitHub Actions workflow runs for the repo at `cwd`, newest first.
  private async loadRuns(cwd: string): Promise<{ ok: boolean; error?: string; runs: WorkflowRun[] }> {
    const r = await this.ghRun([Gh.Sub.Run, Gh.Verb.List, '--limit', '20', '--json', GhFields.Run], cwd)
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
  private async loadDeployments(
    cwd: string
  ): Promise<{ ok: boolean; error?: string; deployments: DeploymentStatus[] }> {
    const repoRes = await this.ghRun(
      [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    const repo = repoRes.out.trim()
    if (!repo) return { ok: false, error: 'Not a GitHub repository (or no remote).', deployments: [] }

    const list = await this.ghRun([Gh.Sub.Api, `repos/${repo}/deployments?per_page=10`], cwd)
    if (!list.ok) return { ok: false, error: (list.err || 'gh api deployments failed').trim(), deployments: [] }
    let raw: RawDeployment[]
    try {
      raw = JSON.parse(list.out.trim() || '[]') as RawDeployment[]
    } catch {
      return { ok: false, error: 'failed to parse deployments', deployments: [] }
    }

    const deployments: DeploymentStatus[] = await Promise.all(
      raw.map(async (d) => {
        const sres = await this.ghRun([Gh.Sub.Api, `repos/${repo}/deployments/${d.id}/statuses?per_page=1`], cwd)
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

  // gh present + authenticated + cwd inside a GitHub repo?
  async available(cwd: string): Promise<{ ok: boolean; repo?: string; error?: string }> {
    if (!existsSync(ghBin()) && ghBin() === 'gh') {
      // ghBin() returns 'gh' only when no known path exists; a PATH lookup may
      // still succeed, so fall through to auth check rather than failing here.
    }
    const auth = await this.ghRun([Gh.Sub.Auth, Gh.Verb.Status], cwd, 6000)
    if (!auth.ok) return { ok: false, error: 'GitHub CLI not authenticated. Run `gh auth login`.' }
    const repo = await this.ghRun(
      [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    if (!repo.ok || !repo.out.trim()) return { ok: false, error: 'Not a GitHub repository (or no remote).' }
    return { ok: true, repo: repo.out.trim() }
  }

  // Open PRs for the repo at `cwd`, newest-updated first.
  async list(cwd: string): Promise<{ ok: boolean; error?: string; prs: PullRequest[] }> {
    const r = await this.ghRun([Gh.Sub.Pr, Gh.Verb.List, '--state', 'open', '--limit', '30', '--json', GhFields.Pr], cwd)
    if (!r.ok) return { ok: false, error: (r.err || 'gh pr list failed').trim(), prs: [] }
    try {
      const arr = JSON.parse(r.out.trim() || '[]') as RawPr[]
      return { ok: true, prs: arr.map(shapePr) }
    } catch {
      return { ok: false, error: 'failed to parse gh output', prs: [] }
    }
  }

  // All git repos under the code root (no gh calls) — feeds the project picker.
  repos(root: string): { ok: boolean; error?: string; repos: { name: string; path: string }[] } {
    const base = resolveBase(root)
    if (!base) return { ok: false, error: 'Set a Code root in settings.', repos: [] }
    const repos = scanRepos(base)
    if (!repos.length) return { ok: false, error: 'Code root is not readable.', repos: [] }
    return { ok: true, repos }
  }

  // Open PRs for the explicitly selected repo paths, grouped per-project. A
  // selected repo with no open PRs is still returned (empty `prs`) so the user
  // sees every project they chose to track.
  async listAll(root: string, paths: string[]): Promise<{ ok: boolean; projects: ProjectPullRequests[] }> {
    const base = resolveBase(root)
    const sel = (Array.isArray(paths) ? paths : []).filter((p) => existsSync(join(p, '.git')))
    if (!sel.length) return { ok: true, projects: [] }
    const groups: ProjectPullRequests[] = await mapPool(sel, 8, async (p) => {
      const r = await this.ghRun([Gh.Sub.Pr, Gh.Verb.List, '--state', 'open', '--limit', '30', '--json', GhFields.Pr], p)
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
  }

  async merge(cwd: string, number: number, method: string): Promise<{ ok: boolean; error?: string }> {
    const flag = method === 'rebase' ? '--rebase' : method === 'merge' ? '--merge' : '--squash'
    const r = await this.ghRun([Gh.Sub.Pr, Gh.Verb.Merge, String(number), flag, '--delete-branch'], cwd, 30000)
    return r.ok ? { ok: true } : { ok: false, error: (r.err || 'merge failed').trim() }
  }

  // Full `gh pr view` text for the detail modal.
  async view(cwd: string, number: number): Promise<string> {
    const r = await this.ghRun([Gh.Sub.Pr, Gh.Verb.View, String(number), '--comments'], cwd)
    return r.ok ? r.out : r.err || 'pr view failed'
  }

  // Unified diff for the in-app diff pane. Try the fast direct diff first; on a
  // large-PR failure (HTTP 406, "diff exceeded the maximum number of files"),
  // fall back to the paginated files API and rebuild the patch ourselves.
  async diff(cwd: string, number: number): Promise<{ ok: boolean; patch?: string; error?: string }> {
    const direct = await this.ghRun([Gh.Sub.Pr, Gh.Verb.Diff, String(number)], cwd, 30000)
    if (direct.ok && direct.out.trim()) return { ok: true, patch: direct.out }

    const repoRes = await this.ghRun(
      [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    const repo = repoRes.out.trim()
    if (!repo) return { ok: false, error: (direct.err || 'gh pr diff failed').trim() }

    const files = await this.ghRun(
      [Gh.Sub.Api, '--paginate', `repos/${repo}/pulls/${number}/files`],
      cwd,
      60000,
      64 * 1024 * 1024
    )
    if (!files.ok) return { ok: false, error: (files.err || direct.err || 'gh pr diff failed').trim() }
    try {
      const patch = buildPatchFromFiles(files.out)
      return patch.trim() ? { ok: true, patch } : { ok: false, error: (direct.err || 'empty diff').trim() }
    } catch {
      return { ok: false, error: (direct.err || 'failed to parse files API').trim() }
    }
  }

  // Post an inline review comment on a contiguous range of new-file lines. The
  // selected rows in the diff pane are always RIGHT-side (added/context) lines,
  // so we anchor to the PR head commit and use start_line/line on the RIGHT.
  async comment(
    cwd: string,
    number: number,
    path: string,
    startLine: number,
    endLine: number,
    body: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!body.trim()) return { ok: false, error: 'Comment body is empty.' }
    const repoRes = await this.ghRun(
      [Gh.Sub.Repo, Gh.Verb.View, '--json', GhFields.NameWithOwner, '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    const repo = repoRes.out.trim()
    if (!repo) return { ok: false, error: 'Not a GitHub repository (or no remote).' }
    const shaRes = await this.ghRun(
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
    const r = await this.ghRun(args, cwd, 20000)
    return r.ok ? { ok: true } : { ok: false, error: (r.err || 'failed to post comment').trim() }
  }

  // Recent GitHub Actions workflow runs for the repo, newest first. Repo-wide
  // (gh has no PR-scoped run list); the renderer keys off headBranch/headSha.
  runs(cwd: string): Promise<{ ok: boolean; error?: string; runs: WorkflowRun[] }> {
    return this.loadRuns(cwd)
  }

  // Job/step breakdown for one run; fetched lazily when a run card is expanded.
  async runJobs(cwd: string, id: number): Promise<string> {
    const r = await this.ghRun([Gh.Sub.Run, Gh.Verb.View, String(id), '--json', GhFields.RunJobs], cwd)
    return r.ok ? r.out : r.err || 'gh run view failed'
  }

  // Latest deployment per recent deployment record, with its current status.
  deployments(cwd: string): Promise<{ ok: boolean; error?: string; deployments: DeploymentStatus[] }> {
    return this.loadDeployments(cwd)
  }

  // Deployments + workflow runs for the explicitly selected repo paths, grouped
  // per-project (mirror of pr:list-all for the Deployments view).
  async deploysAll(root: string, paths: string[]): Promise<{ ok: boolean; projects: ProjectDeployments[] }> {
    const base = resolveBase(root)
    const sel = (Array.isArray(paths) ? paths : []).filter((p) => existsSync(join(p, '.git')))
    if (!sel.length) return { ok: true, projects: [] }
    const projects: ProjectDeployments[] = await mapPool(sel, 6, async (p) => {
      const [dep, runs] = await Promise.all([this.loadDeployments(p), this.loadRuns(p)])
      return {
        name: relName(base, p),
        path: p,
        deployments: dep.ok ? dep.deployments : [],
        runs: runs.ok ? runs.runs : []
      }
    })
    return { ok: true, projects }
  }
}
