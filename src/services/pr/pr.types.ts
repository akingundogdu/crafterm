// Pull-request / CI domain data models (moved out of the former bridge api.d.ts).
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
