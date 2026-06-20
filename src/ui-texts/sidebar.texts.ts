// Left sidebar (terminal/notebook tree) + tab strips + context menus UI copy.
export const Sidebar = {
  cancel: 'Cancel',
  save: 'Save',
  showDetails: 'Show details',
  hideDetails: 'Hide details',
  stopProcess: 'Stop process',
  newWorktreeTitle: 'New worktree',
  pinnedTitle: 'pinned',
  commandPlaceholder: 'command',
  showActiveItems: 'Show active items',
  showArchivedItems: 'Show archived items',
  groupWorkspace: 'Group / workspace',
  sections: {
    pinned: 'Pinned',
    free: 'Free'
  },
  tabs: {
    terminal: 'Terminal',
    notebook: 'Notebook',
    database: 'Database',
    docker: 'Docker',
    accounts: 'Accounts',
    alerts: 'Alerts',
    reminders: 'Reminders',
    files: 'Files',
    time: 'Time',
    pr: 'PR',
    bookmarks: 'Bookmarks'
  },
  menu: {
    restoreSession: 'Restore session',
    newClaudeTerminal: 'New Claude terminal',
    rename: 'Rename',
    autoName: 'Auto-name',
    closeTab: 'Close tab',
    newTerminalHere: 'New terminal here',
    newClaudeTerminalHere: 'New Claude terminal here',
    runInBackground: 'Run in background…',
    command: 'Command',
    revealInFinder: 'Reveal in Finder',
    deleteWorktree: 'Delete worktree',
    newWorktree: 'New worktree…',
    newSubfolder: 'New subfolder',
    runApplications: 'Run applications…',
    runCommand: 'Run command…',
    newFeature: 'New feature…',
    setGroup: 'Set group…',
    folderSettings: 'Folder settings…',
    deleteFolder: 'Delete folder'
  }
} as const
