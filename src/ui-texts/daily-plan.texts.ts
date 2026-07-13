// User-facing copy for the Daily Plan screen (Kanban board + assign modal).
export const DailyPlan = {
  status: {
    backlog: 'Backlog',
    todo: 'Todo',
    wip: 'In Progress',
    review: 'Code Review',
    test: 'Test',
    done: 'Done'
  },
  priority: { low: 'Low', medium: 'Medium', high: 'High' },
  due: {
    overdueOne: 'Overdue by 1 day',
    overdueMany: (n: number): string => `Overdue by ${n} days`,
    today: 'Due today',
    tomorrow: 'Due tomorrow',
    daysLeft: (d: number): string => `${d} days left`
  },
  headerPrefix: { today: 'Today · ', yesterday: 'Yesterday · ', tomorrow: 'Tomorrow · ' },
  ok: 'OK',
  noProject: {
    title: 'No project',
    message: 'Assign a project to this task first (Edit → Project).'
  },
  noIssueKey: {
    title: 'No issue key prefix',
    message: (name: string): string => `Set an issue key prefix for "${name}" in Settings → Projects first.`
  },
  worktreeFailed: {
    title: 'Worktree failed',
    message: (branch: string): string => `Could not create a worktree for ${branch}.`
  },
  searchTasks: 'Search tasks…',
  assignTitle: 'Assign daily task',
  range: {
    today: 'Today',
    last2: 'Last 2 days',
    last3: 'Last 3 days',
    last4: 'Last 4 days',
    last5: 'Last 5 days',
    last7: 'Last 7 days',
    last10: 'Last 10 days',
    all: 'All'
  },
  openBoardTitle: 'Open full board',
  prevDay: 'Previous day',
  nextDay: 'Next day',
  changelogTitle: 'Generate a customer-facing changelog from completed tasks',
  allProjects: 'All projects',
  filterTags: 'Filter tags',
  filterTagsCount: (n: number): string => `Filter tags (${n})`
} as const
