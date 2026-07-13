import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  PASS_CHECK_STATUSES,
  FAIL_CHECK_STATUSES,
  type PullRequest,
  type PrChecks,
  type WorkflowRun,
  type RollupItem,
  type PrFileEntry,
  type RawPr,
  type RawRun
} from './pr.types'

// Run an async mapper over items with a fixed concurrency cap, preserving order.
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
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

export function resolveBase(root: string): string {
  let base = root && root.trim() ? root.trim() : ''
  if (base.startsWith('~')) base = join(homedir(), base.slice(1))
  return base
}

// Two-level git-repo scan under `base`. A child that is itself a repo is one
// project; a group folder contributes each of its repo subfolders as
// "group/name".
export function scanRepos(base: string): { name: string; path: string }[] {
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
export function relName(base: string, p: string): string {
  return base && p.startsWith(base + '/') ? p.slice(base.length + 1) : p.split('/').pop() || p
}

// Reconstruct a unified diff from the PR "files" API, which paginates and so
// works past the 300-file cap that fails `gh pr diff`. Each file carries its own
// hunks in `patch`; we prepend the git/path headers our diff parser expects.
export function buildPatchFromFiles(json: string): string {
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
export function summarizeChecks(rollup: RollupItem[] | undefined): PrChecks {
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

export function shapeRun(r: RawRun): WorkflowRun {
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

export function shapePr(p: RawPr): PullRequest {
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
