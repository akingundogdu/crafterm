// User-facing copy for the Time screen (right panel → Time + track modal + report).
export const Time = {
  noProjects: '(no projects)',
  noFeature: '(no feature)',
  today: 'Today',
  noTimeToday: 'No time logged today',
  start: 'Start',
  stop: 'Stop',
  pomodoroDoneTitle: 'Pomodoro done',
  sessionFallback: 'Session',
  pomodoroBody: (name: string): string => `${name} · time logged`,
  newFeature: {
    title: 'New feature',
    label: 'Feature name',
    placeholder: 'e.g. auth setup',
    confirm: 'Add'
  },
  trackModal: {
    stopTracking: 'Stop tracking',
    track: 'Track',
    title: 'Track time for this terminal',
    project: 'Project',
    feature: 'Feature'
  },
  report: {
    title: 'Time report',
    today: 'Today',
    week: 'Last 7 days',
    month: 'Last 30 days',
    all: 'All time',
    tabToday: 'Today',
    tabWeek: '7 days',
    tabMonth: '30 days',
    tabAll: 'All',
    empty: 'No time logged in this range',
    total: 'Total',
    copy: 'Copy report',
    copied: 'Copied'
  }
} as const
