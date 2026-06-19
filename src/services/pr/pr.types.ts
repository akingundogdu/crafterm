// Pull-request / CI domain data models (moved out of the former bridge api.d.ts).

// GitHub check-run / status-context states (from `statusCheckRollup`). Grouped
// into pass/fail buckets in summarizeChecks; anything else counts as pending.
export enum CheckStatus {
  Success = 'SUCCESS',
  Neutral = 'NEUTRAL',
  Skipped = 'SKIPPED',
  Failure = 'FAILURE',
  Error = 'ERROR',
  Cancelled = 'CANCELLED',
  TimedOut = 'TIMED_OUT',
  ActionRequired = 'ACTION_REQUIRED',
  StartupFailure = 'STARTUP_FAILURE',
  Pending = 'PENDING',
  Queued = 'QUEUED',
  InProgress = 'IN_PROGRESS',
  Expected = 'EXPECTED'
}

export const PASS_CHECK_STATUSES: readonly string[] = [
  CheckStatus.Success,
  CheckStatus.Neutral,
  CheckStatus.Skipped
]
export const FAIL_CHECK_STATUSES: readonly string[] = [
  CheckStatus.Failure,
  CheckStatus.Error,
  CheckStatus.Cancelled,
  CheckStatus.TimedOut,
  CheckStatus.ActionRequired,
  CheckStatus.StartupFailure
]

// gh CLI tokens — top-level subcommands + second-level verbs — centralized so
// the handlers read from one source instead of inline string literals.
export const Gh = {
  Sub: {
    Pr: 'pr',
    Auth: 'auth',
    Repo: 'repo',
    Run: 'run',
    Api: 'api'
  },
  Verb: {
    List: 'list',
    Merge: 'merge',
    View: 'view',
    Diff: 'diff',
    Status: 'status'
  }
} as const

// gh `--json` field selectors, gathered in one place.
export const GhFields = {
  Pr: 'number,title,headRefName,baseRefName,state,isDraft,mergeable,reviewDecision,url,statusCheckRollup,comments,updatedAt',
  Run: 'databaseId,name,displayTitle,status,conclusion,event,headBranch,headSha,url,createdAt',
  NameWithOwner: 'nameWithOwner',
  HeadRefOid: 'headRefOid',
  RunJobs: 'jobs'
} as const

// --- Raw gh-JSON parse shapes (consumed only by pr.main.ts mappers) ---
export interface RollupItem {
  __typename?: string
  status?: string // CheckRun: QUEUED | IN_PROGRESS | COMPLETED
  conclusion?: string // CheckRun: SUCCESS | FAILURE | …
  state?: string // StatusContext: SUCCESS | PENDING | FAILURE | ERROR
}

export interface PrFileEntry {
  filename: string
  status: string // added | removed | modified | renamed | …
  patch?: string
  previous_filename?: string
}

export interface RawPr {
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

export interface RawRun {
  databaseId: number
  name?: string
  displayTitle?: string
  status?: string
  conclusion?: string
  event?: string
  headBranch?: string
  headSha?: string
  url?: string
  createdAt?: string
}

export interface RawDeployment {
  id: number
  environment?: string
  ref?: string
  sha?: string
  description?: string
  created_at?: string
}

export interface RawDeployStatus {
  state?: string // pending | in_progress | success | failure | error | inactive | queued
  description?: string
  environment_url?: string
  log_url?: string
  target_url?: string
  created_at?: string
}

export interface WorkflowRun {
  id: number
  name: string
  title: string
  status: string // queued | in_progress | completed
  conclusion: string // success | failure | cancelled | '' while running
  event: string
  headBranch: string
  headSha: string
  url: string
  createdAt: string
}

export interface DeploymentStatus {
  id: number
  environment: string
  ref: string
  state: string // pending | in_progress | success | failure | error | inactive
  description: string
  url: string
  createdAt: string
}

export interface PrChecks {
  pass: number
  fail: number
  pending: number
  total: number
  state: 'success' | 'failure' | 'pending' | 'none'
}

export interface PullRequest {
  number: number
  title: string
  headRefName: string
  baseRefName: string
  state: string
  isDraft: boolean
  mergeable: string // MERGEABLE | CONFLICTING | UNKNOWN
  reviewDecision: string // APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | ''
  url: string
  comments: number
  checks: PrChecks
  updatedAt: string
}

// One project (git repo) under the code root, with its open PRs.
export interface ProjectPullRequests {
  name: string
  path: string
  repo: string
  prs: PullRequest[]
}

// One project (git repo) under the code root, with its deployments + CI runs.
export interface ProjectDeployments {
  name: string
  path: string
  deployments: DeploymentStatus[]
  runs: WorkflowRun[]
}
