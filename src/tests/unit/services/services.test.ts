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
} from '@services/index'

// The ipc wrappers are the ONLY callers of window.crafterm. The bridge is
// namespaced (crafterm.<ns>.<method>) and each wrapper forwards 1:1 to the
// same-named method in its namespace. These are the regression guard for that
// method->channel mapping. We mock window.crafterm with a nested Proxy that hands
// out one memoized spy per (namespace, method), call every method, and assert the
// matching channel was invoked with the same args.

let channels: Record<string, Record<string, ReturnType<typeof vi.fn>>>
beforeEach(() => {
  channels = {}
  ;(window as unknown as { crafterm: unknown }).crafterm = new Proxy(
    {},
    {
      get: (_t, ns: string) => {
        const nsChannels = (channels[ns] ??= {})
        return new Proxy(
          {},
          {
            get: (_t2, method: string) =>
              (nsChannels[method] ??= vi.fn().mockReturnValue('RESULT'))
          }
        )
      }
    }
  )
})

// Each service's methods forward to the same-named method under its namespace.
const MAP: Record<string, string[]> = {
  terminal: [
    'createPty', 'input', 'resize', 'kill', 'onData', 'onExit', 'adoptPane', 'paneInfo',
    'onCloseActivePane', 'onFocusPane', 'popoutOpen', 'popoutConfirmClose', 'popoutFocus',
    'onPopoutKilled', 'onPopoutConfirmClose', 'procStart', 'procBuffer', 'procAttach', 'onProcExit'
  ],
  git: ['branches', 'stashList', 'fileStatus', 'listWorktrees', 'worktreeAdd'],
  fs: [
    'listDir', 'listEntries', 'findAllMarkdown', 'findFiles', 'resolveFile', 'readMd', 'readText',
    'writeMd', 'writeText', 'createFile', 'mkdir', 'renamePath', 'trashPath', 'resolveImport',
    'ideOpen', 'openPath', 'revealPath', 'openMarkdown'
  ],
  claude: [
    'latestSession', 'sessionCwd', 'sessions', 'sessionTitle', 'sessionStatus', 'permissionMode',
    'watchSessions', 'onSessionsChanged', 'usageSummary', 'realUsage'
  ],
  notebook: ['tree', 'read', 'write', 'mkdir', 'create', 'rename', 'move', 'delete', 'reveal'],
  plans: ['list', 'forBranch', 'scan', 'onChanged'],
  db: ['connect', 'objects', 'columns', 'query', 'disconnect', 'savedList', 'savedRead', 'savedWrite', 'savedDelete'],
  docker: ['available', 'containers', 'images', 'volumes', 'networks', 'compose', 'stats', 'inspect', 'logs', 'action', 'prune'],
  pr: ['available', 'list', 'repos', 'listAll', 'merge', 'view', 'diff', 'comment', 'runs', 'runJobs', 'deployments', 'deploysAll'],
  secrets: ['available', 'get', 'set', 'delete'],
  ios: ['worktreeScript', 'worktreeReport', 'worktreeStop', 'listTargets', 'listSchemes'],
  app: [
    'version', 'buildInfo', 'buildCounter', 'repoGit', 'deployBuild', 'deployKillAllPtys', 'deploySwap',
    'deployWasUpdating', 'openExternal', 'notify', 'monacoTheme', 'zshCommands', 'todoRead', 'todoWrite',
    'backlogRead', 'playSound', 'playEventSound', 'onAppQuitting', 'onFullscreenChange', 'openImproveWindow',
    'improveWindowSetAlwaysOnTop'
  ],
  store: ['load', 'save']
}

// Loosely typed for the data-driven loop; each method is precisely typed at its
// own call site, which is irrelevant to the channel-forwarding being asserted.
const SERVICES: Record<string, Record<string, unknown>> = {
  terminal: terminalService, git: gitService, fs: fsService, claude: claudeService, notebook: notebookService,
  plans: plansService, db: dbService, docker: dockerService, pr: prService, secrets: secretsService,
  ios: iosService, app: appService, store: storeService
}

for (const [ns, methods] of Object.entries(MAP)) {
  describe(`${ns}Service forwards each method to its bridge channel`, () => {
    for (const method of methods) {
      it(`${method} -> window.crafterm.${ns}.${method}`, () => {
        const fn = SERVICES[ns][method] as (...a: unknown[]) => unknown
        const ret = fn('A', 2)
        expect(channels[ns]?.[method], `${method} must call ${ns}.${method}`).toHaveBeenCalledWith(
          'A',
          2
        )
        expect(ret).toBe('RESULT') // returns the bridge result untouched
      })
    }
  })
}

it('every service method is covered by the mapping table', () => {
  for (const [name, svc] of Object.entries(SERVICES)) {
    const declared = Object.keys(svc).sort()
    const mapped = [...MAP[name]].sort()
    expect(mapped, `${name}Service: mapping table must list every method`).toEqual(declared)
  }
})
