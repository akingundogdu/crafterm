// Modal pickers/finders (command palette, project/worktree/SSH/Claude, md/file
// finders, global search, git) UI copy.
export const Pickers = {
  common: { noMatches: 'No matches' },
  globalSearch: {
    heading: 'Search Crafterm',
    placeholder: 'Search projects, panes, actions, bookmarks, notes, plans…'
  },
  update: { heading: 'Updating Crafterm', confirm: 'Update & Restart' },
  plans: { heading: 'Plans', placeholder: 'Filter plans…  (↑↓ move · ⏎ open)' },
  processes: { heading: 'Running processes', devicesHeading: 'Running devices' },
  claude: {
    sessionsHeading: 'Claude sessions',
    switchAccountHeading: 'Switch Claude account',
    resumeHeading: 'Resume Claude session',
    resumePlaceholder: 'Search sessions…  (↑↓ move · ⏎ resume in a new terminal)',
    noSessions: 'No Claude sessions found'
  },
  folder: {
    pickPlaceholder: 'Filter folders…  (↑↓ move · → enter · ← up · ⏎ pick)',
    openPlaceholder: 'Filter folders…  (↑↓ move · → enter · ← up · ⏎ open)',
    enterFolder: 'Enter folder'
  },
  worktree: { heading: 'Worktrees' },
  project: {
    open: 'Open project',
    split: 'Split with project',
    splitPlaceholder: 'Filter projects…  (⏎ split right)',
    openPlaceholder: 'Filter projects…  (↑↓ move · ⏎ open · ⌘⏎ split right)',
    noEnvironments: 'No environments.',
    noApplications: 'No applications.',
    noEnvironmentsConfigured: 'No environments configured.',
    noApplicationsDefined: 'No applications defined for this project.',
    cancel: 'Cancel',
    includeTitle: 'Include',
    runApplications: 'Run applications',
    newFeature: 'New feature',
    runSplitTitle: 'Run in a split beside the active pane',
    runTabTitle: 'Run in a new terminal tab under the project'
  },
  finders: {
    mdHeading: 'Open markdown file',
    searchPlaceholder: 'Search by file name',
    loading: 'Loading...',
    noFoldersConfigured: 'No folders configured. Add them in Settings → Commands.',
    noMatches: 'No matches'
  },
  ssh: {
    editHeading: 'Edit SSH connection',
    newHeading: 'New SSH connection',
    connectionsHeading: 'My SSH connections',
    host: 'Host',
    user: 'User',
    port: 'Port',
    label: 'Label',
    hostPlaceholder: 'example.com or 1.2.3.4',
    userPlaceholder: 'root',
    portPlaceholder: '22',
    labelPlaceholder: 'My server (optional)',
    passwordPlaceholder: '(optional · stored as plaintext)',
    save: 'Save',
    add: 'Add',
    deleteTitle: 'Delete connection?',
    delete: 'Delete'
  },
  command: {
    heading: 'Commands',
    placeholder: 'Search commands…  (⏎ insert into active terminal)',
    terminalsHeading: 'Open terminals',
    terminalsPlaceholder: 'Search terminals…  (↑↓ move · ⏎ focus)',
    noTerminals: 'No open terminals',
    historyHeading: 'Command history',
    filterPlaceholder: 'Filter commands…',
    noCommands: 'No commands yet'
  },
  git: {
    stashesHeading: 'Git stashes',
    branchHeading: 'Branch',
    branchPlaceholder: 'Search branches…  (↑↓ move · ⏎ checkout)',
    dropConfirm: 'Drop',
    noStashes: 'No stashes',
    restoreTitle: 'Restore this stash (keeps it in the list)',
    deleteStashTitle: 'Delete this stash'
  }
} as const
