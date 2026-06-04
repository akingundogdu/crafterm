import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'

// Resolve the GitHub CLI; GUI-launched apps don't inherit the shell PATH.
function ghBin(): string {
  for (const p of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh']) {
    if (existsSync(p)) return p
  }
  return 'gh'
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
interface PrFileEntry {
  filename: string
  status: string // added | removed | modified | renamed | …
  patch?: string
  previous_filename?: string
}

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

interface RollupItem {
  __typename?: string
  status?: string // CheckRun: QUEUED | IN_PROGRESS | COMPLETED
  conclusion?: string // CheckRun: SUCCESS | FAILURE | …
  state?: string // StatusContext: SUCCESS | PENDING | FAILURE | ERROR
}

// Collapse the per-check rollup into pass/fail/pending counts + an overall state.
function summarizeChecks(rollup: RollupItem[] | undefined): {
  pass: number
  fail: number
  pending: number
  total: number
  state: 'success' | 'failure' | 'pending' | 'none'
} {
  let pass = 0
  let fail = 0
  let pending = 0
  for (const c of rollup ?? []) {
    const v = (c.conclusion || c.state || c.status || '').toUpperCase()
    if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(v)) pass++
    else if (['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(v))
      fail++
    else pending++ // PENDING | QUEUED | IN_PROGRESS | EXPECTED | ''
  }
  const total = pass + fail + pending
  const state = total === 0 ? 'none' : fail > 0 ? 'failure' : pending > 0 ? 'pending' : 'success'
  return { pass, fail, pending, total, state }
}

const PR_FIELDS =
  'number,title,headRefName,baseRefName,state,isDraft,mergeable,reviewDecision,url,statusCheckRollup,comments,updatedAt'

interface RawPr {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  state: string
  isDraft: boolean
  mergeable: string
  reviewDecision: string
  url: string
  statusCheckRollup?: RollupItem[]
  comments?: unknown[]
  updatedAt?: string
}

function shapePr(p: RawPr): Record<string, unknown> {
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

export function registerPrIpc(): void {
  // gh present + authenticated + cwd inside a GitHub repo?
  ipcMain.handle('pr:available', async (_e, { cwd }: { cwd: string }) => {
    if (!existsSync(ghBin()) && ghBin() === 'gh') {
      // ghBin() returns 'gh' only when no known path exists; a PATH lookup may
      // still succeed, so fall through to auth check rather than failing here.
    }
    const auth = await ghRun(['auth', 'status'], cwd, 6000)
    if (!auth.ok) return { ok: false, error: 'GitHub CLI not authenticated. Run `gh auth login`.' }
    const repo = await ghRun(['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], cwd, 6000)
    if (!repo.ok || !repo.out.trim())
      return { ok: false, error: 'Not a GitHub repository (or no remote).' }
    return { ok: true, repo: repo.out.trim() }
  })

  // Open PRs for the repo at `cwd`, newest-updated first.
  ipcMain.handle('pr:list', async (_e, { cwd }: { cwd: string }) => {
    const r = await ghRun(['pr', 'list', '--state', 'open', '--limit', '30', '--json', PR_FIELDS], cwd)
    if (!r.ok) return { ok: false, error: (r.err || 'gh pr list failed').trim(), prs: [] }
    try {
      const arr = JSON.parse(r.out.trim() || '[]') as RawPr[]
      return { ok: true, prs: arr.map(shapePr) }
    } catch {
      return { ok: false, error: 'failed to parse gh output', prs: [] }
    }
  })

  ipcMain.handle(
    'pr:merge',
    async (
      _e,
      { cwd, number, method }: { cwd: string; number: number; method: string }
    ): Promise<{ ok: boolean; error?: string }> => {
      const flag = method === 'rebase' ? '--rebase' : method === 'merge' ? '--merge' : '--squash'
      const r = await ghRun(['pr', 'merge', String(number), flag, '--delete-branch'], cwd, 30000)
      return r.ok ? { ok: true } : { ok: false, error: (r.err || 'merge failed').trim() }
    }
  )

  // Full `gh pr view` text for the detail modal.
  ipcMain.handle('pr:view', async (_e, { cwd, number }: { cwd: string; number: number }) => {
    const r = await ghRun(['pr', 'view', String(number), '--comments'], cwd)
    return r.ok ? r.out : r.err || 'pr view failed'
  })

  // Unified diff for the in-app diff pane. Try the fast direct diff first; on a
  // large-PR failure (HTTP 406, "diff exceeded the maximum number of files"),
  // fall back to the paginated files API and rebuild the patch ourselves.
  ipcMain.handle('pr:diff', async (_e, { cwd, number }: { cwd: string; number: number }) => {
    const direct = await ghRun(['pr', 'diff', String(number)], cwd, 30000)
    if (direct.ok && direct.out.trim()) return { ok: true, patch: direct.out }

    const repoRes = await ghRun(
      ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
      cwd,
      6000
    )
    const repo = repoRes.out.trim()
    if (!repo) return { ok: false, error: (direct.err || 'gh pr diff failed').trim() }

    const files = await ghRun(
      ['api', '--paginate', `repos/${repo}/pulls/${number}/files`],
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
  ipcMain.handle(
    'pr:comment',
    async (
      _e,
      {
        cwd,
        number,
        path,
        startLine,
        endLine,
        body
      }: {
        cwd: string
        number: number
        path: string
        startLine: number
        endLine: number
        body: string
      }
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!body.trim()) return { ok: false, error: 'Comment body is empty.' }
      const repoRes = await ghRun(
        ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
        cwd,
        6000
      )
      const repo = repoRes.out.trim()
      if (!repo) return { ok: false, error: 'Not a GitHub repository (or no remote).' }
      const shaRes = await ghRun(
        ['pr', 'view', String(number), '--json', 'headRefOid', '-q', '.headRefOid'],
        cwd,
        10000
      )
      const sha = shaRes.out.trim()
      if (!sha) return { ok: false, error: (shaRes.err || 'failed to resolve PR head commit').trim() }

      const lo = Math.min(startLine, endLine)
      const hi = Math.max(startLine, endLine)
      const args = [
        'api',
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
    }
  )
}
