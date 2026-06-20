// Right-panel Notifications/Alerts UI copy.
export const Notifications = {
  empty: 'No notifications',
  dismiss: 'Dismiss',
  showDetails: 'Show details',
  hideDetails: 'Hide details',
  remindMe: 'Remind me',
  remindMeLater: 'Remind me later',
  remindMeAbout: 'Remind me about this',
  claudeUsageHeading: 'Claude Usage',
  claudeUsageFallback: 'Claude usage',
  upToDate: 'up to date',
  appName: 'Crafterm',
  deployHint: (version: string) => `Crafterm v${version} · click to deploy`,
  bars: {
    session: 'Current session',
    week: 'Current week (all models)',
    weekSonnet: 'Current week (Sonnet only)'
  },
  cardActions: {
    open: 'Open',
    show: 'Show',
    goToPane: 'Go to pane',
    openNote: 'Open note',
    openTask: 'Open task',
    openPlan: 'Open plan',
    openMeeting: 'Open meeting'
  }
} as const
