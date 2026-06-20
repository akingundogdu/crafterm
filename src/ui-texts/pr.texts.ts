// User-facing copy for the PR / Deployments screen.
export const Pr = {
  merge: {
    title: (n: number): string => `Merge PR #${n}`,
    message: (title: string, base: string): string =>
      `Squash-merge "${title}" into ${base} and delete the branch?`,
    confirm: 'Squash & merge',
    failed: 'Merge failed'
  },
  unknownError: 'unknown error',
  createPr: '+ Create PR',
  createPrTitle: 'Run `gh pr create --web` beside the active pane',
  refreshTitle: 'Refresh',
  subPrs: 'Pull Requests',
  subDeploys: 'Deployments',
  scopeCurrent: 'Current',
  scopeAll: 'All projects',
  loading: 'Loading…',
  cliUnavailable: 'GitHub CLI unavailable.',
  addProjects: '+ Add projects',
  addProjectsTitle: 'Choose which repositories appear here',
  deployments: 'Deployments',
  workflowRuns: 'Workflow runs',
  review: { approved: 'approved', changes: 'changes', reviewNeeded: 'review needed' },
  card: {
    review: 'Review',
    reviewTitle: 'Open the PR in an in-app browser pane',
    diff: 'Diff',
    diffTitle: 'Open the diff in an in-app pane; select lines to send to a terminal',
    merge: 'Merge',
    open: 'Open',
    runOpenTitle: 'Open this run on GitHub',
    logs: 'Logs',
    logsTitle: 'Show job/step breakdown',
    deployOpenTitle: 'Open the deployment / environment URL'
  },
  picker: {
    search: 'Search repositories by name',
    loading: 'Loading…',
    cancel: 'Cancel',
    save: 'Save',
    title: 'Add projects'
  }
} as const
