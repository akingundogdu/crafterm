// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  terminalService,
  gitService,
  fsService,
  claudeService,
  notebookService,
  plansService,
  dbService,
  dockerService,
  prService,
  secretsService,
  iosService,
  appService,
  storeService
} from './index'

// The ipc wrappers are the ONLY callers of window.crafterm. Each wrapper method
// must forward 1:1 to a specific bridge channel (some are renamed, e.g.
// claudeService.latestSession -> claudeLatestSession). These are the regression
// guard for that method->channel mapping. We mock window.crafterm with a Proxy
// that hands out one memoized spy per channel, call every method, and assert the
// matching channel was invoked with the same args.

let channels: Record<string, ReturnType<typeof vi.fn>>
beforeEach(() => {
  channels = {}
  ;(window as unknown as { crafterm: unknown }).crafterm = new Proxy(
    {},
    {
      get: (_t, key: string) => (channels[key] ??= vi.fn().mockReturnValue('RESULT'))
    }
  )
})

// method name on the service  ->  bridge channel it must call
const MAP: Record<string, Record<string, string>> = {
  terminal: {
    createPty: 'createPty', input: 'input', resize: 'resize', kill: 'kill', onData: 'onData',
    onExit: 'onExit', adoptPane: 'adoptPane', paneInfo: 'paneInfo', onCloseActivePane: 'onCloseActivePane',
    onFocusPane: 'onFocusPane', popoutOpen: 'popoutOpen', popoutConfirmClose: 'popoutConfirmClose',
    popoutFocus: 'popoutFocus', onPopoutKilled: 'onPopoutKilled', onPopoutConfirmClose: 'onPopoutConfirmClose',
    procStart: 'procStart', procBuffer: 'procBuffer', procAttach: 'procAttach', onProcExit: 'onProcExit'
  },
  git: { branches: 'gitBranches', stashList: 'gitStashList', fileStatus: 'gitFileStatus', listWorktrees: 'listWorktrees', worktreeAdd: 'worktreeAdd' },
  fs: {
    listDir: 'listDir', listEntries: 'listEntries', findAllMarkdown: 'findAllMarkdown', findFiles: 'findFiles',
    resolveFile: 'resolveFile', readMd: 'readMd', readText: 'readText', writeMd: 'writeMd', writeText: 'writeText',
    createFile: 'createFile', mkdir: 'mkdir', renamePath: 'renamePath', trashPath: 'trashPath',
    resolveImport: 'resolveImport', ideOpen: 'ideOpen', openPath: 'openPath', revealPath: 'revealPath', openMarkdown: 'openMarkdown'
  },
  claude: {
    latestSession: 'claudeLatestSession', sessionCwd: 'claudeSessionCwd', sessions: 'claudeSessions',
    sessionTitle: 'claudeSessionTitle', sessionStatus: 'claudeSessionStatus', permissionMode: 'claudePermissionMode',
    watchSessions: 'watchClaudeSessions', onSessionsChanged: 'onClaudeSessionsChanged',
    usageSummary: 'claudeUsageSummary', realUsage: 'claudeRealUsage'
  },
  notebook: { tree: 'nbTree', read: 'nbRead', write: 'nbWrite', mkdir: 'nbMkdir', create: 'nbCreate', rename: 'nbRename', move: 'nbMove', delete: 'nbDelete', reveal: 'nbReveal' },
  plans: { list: 'listPlans', forBranch: 'plansForBranch', scan: 'scanPlans', onChanged: 'onPlansChanged' },
  db: { connect: 'dbConnect', objects: 'dbObjects', columns: 'dbColumns', query: 'dbQuery', disconnect: 'dbDisconnect', savedList: 'dbqList', savedRead: 'dbqRead', savedWrite: 'dbqWrite', savedDelete: 'dbqDelete' },
  docker: { available: 'dockerAvailable', containers: 'dockerContainers', images: 'dockerImages', volumes: 'dockerVolumes', networks: 'dockerNetworks', compose: 'dockerCompose', stats: 'dockerStats', inspect: 'dockerInspect', logs: 'dockerLogs', action: 'dockerAction', prune: 'dockerPrune' },
  pr: { available: 'prAvailable', list: 'prList', repos: 'prRepos', listAll: 'prListAll', merge: 'prMerge', view: 'prView', diff: 'prDiff', comment: 'prComment', runs: 'ghRuns', runJobs: 'ghRunJobs', deployments: 'ghDeployments', deploysAll: 'ghDeploysAll' },
  secrets: { available: 'secretsAvailable', get: 'secretGet', set: 'secretSet', delete: 'secretDelete' },
  ios: { worktreeScript: 'iosWorktreeScript', worktreeReport: 'iosWorktreeReport', worktreeStop: 'iosWorktreeStop', listTargets: 'iosListTargets', listSchemes: 'iosListSchemes' },
  app: {
    version: 'appVersion', buildInfo: 'appBuildInfo', buildCounter: 'appBuildCounter', repoGit: 'repoGit',
    deployBuild: 'deployBuild', deployKillAllPtys: 'deployKillAllPtys', deploySwap: 'deploySwap', deployWasUpdating: 'deployWasUpdating',
    openExternal: 'openExternal', notify: 'notify', monacoTheme: 'monacoTheme', zshCommands: 'zshCommands',
    todoRead: 'todoRead', todoWrite: 'todoWrite', backlogRead: 'backlogRead', playSound: 'playSound', playEventSound: 'playEventSound',
    onAppQuitting: 'onAppQuitting', onFullscreenChange: 'onFullscreenChange', openImproveWindow: 'openImproveWindow', improveWindowSetAlwaysOnTop: 'improveWindowSetAlwaysOnTop'
  },
  store: { load: 'loadState', save: 'saveState' }
}

// Loosely typed for the data-driven loop; each method is precisely typed at its
// own call site, which is irrelevant to the channel-forwarding being asserted.
const SERVICES: Record<string, Record<string, unknown>> = {
  terminal: terminalService, git: gitService, fs: fsService, claude: claudeService, notebook: notebookService,
  plans: plansService, db: dbService, docker: dockerService, pr: prService, secrets: secretsService,
  ios: iosService, app: appService, store: storeService
}

for (const [name, methods] of Object.entries(MAP)) {
  describe(`${name}Service forwards each method to its bridge channel`, () => {
    for (const [method, channel] of Object.entries(methods)) {
      it(`${method} -> window.crafterm.${channel}`, () => {
        const fn = SERVICES[name][method] as (...a: unknown[]) => unknown
        const ret = fn('A', 2)
        expect(channels[channel], `${method} must call ${channel}`).toHaveBeenCalledWith('A', 2)
        expect(ret).toBe('RESULT') // returns the bridge result untouched
      })
    }
  })
}

it('every service method is covered by the mapping table', () => {
  for (const [name, svc] of Object.entries(SERVICES)) {
    const declared = Object.keys(svc).sort()
    const mapped = Object.keys(MAP[name]).sort()
    expect(mapped, `${name}Service: mapping table must list every method`).toEqual(declared)
  }
})
