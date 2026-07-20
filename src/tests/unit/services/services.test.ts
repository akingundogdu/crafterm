// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  terminalService,
  paneService,
  gitService,
  fsService,
  dirService,
  ideService,
  shellService,
  markdownService,
  claudeService,
  notebookService,
  plansService,
  dbService,
  dbqService,
  dockerService,
  prService,
  secretsService,
  iosService,
  appService,
  deployService,
  monacoService,
  zshService,
  todoService,
  backlogService,
  soundService,
  storeService
} from '@services/index'

// The domain client wrappers are the ONLY callers of window.crafterm, which is
// now the generic bridge { invoke, send, on } (Phase 10 Step 6b). Each wrapper
// routes to a channel STRING with a shaped payload. The channel registry +
// channels.client helpers give compile-time type safety; this is the runtime
// regression guard that each method targets the RIGHT channel with the RIGHT
// payload (a wrong-but-same-shape channel would otherwise slip past the type).

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
let on: ReturnType<typeof vi.fn>
beforeEach(() => {
  invoke = vi.fn().mockReturnValue('RESULT')
  send = vi.fn()
  on = vi.fn().mockReturnValue(() => {})
  ;(window as unknown as { crafterm: unknown }).crafterm = { invoke, send, on }
})

type Kind = 'invoke' | 'send' | 'listen'
interface Entry {
  ns: string
  method: string
  kind: Kind
  channel: string
  args: unknown[]
  payload?: unknown
}

const cb = (): void => {}

const ENTRIES: Entry[] = [
  // ── terminal / pty ──
  { ns: 'terminal', method: 'createPty', kind: 'invoke', channel: 'pty:create', args: [{ cwd: '/x' }], payload: { cwd: '/x' } },
  { ns: 'terminal', method: 'input', kind: 'send', channel: 'pty:input', args: ['id', 'd'], payload: { id: 'id', data: 'd' } },
  { ns: 'terminal', method: 'resize', kind: 'send', channel: 'pty:resize', args: ['id', 80, 24], payload: { id: 'id', cols: 80, rows: 24 } },
  { ns: 'terminal', method: 'kill', kind: 'send', channel: 'pty:kill', args: ['id'], payload: { id: 'id' } },
  { ns: 'terminal', method: 'onData', kind: 'listen', channel: 'pty:data', args: [cb] },
  { ns: 'terminal', method: 'onExit', kind: 'listen', channel: 'pty:exit', args: [cb] },
  { ns: 'terminal', method: 'adoptPane', kind: 'send', channel: 'pty:adopt', args: ['id'], payload: { id: 'id' } },
  { ns: 'pane', method: 'info', kind: 'invoke', channel: 'pane:info', args: ['id', 's'], payload: { id: 'id', stableId: 's' } },
  { ns: 'terminal', method: 'onCloseActivePane', kind: 'listen', channel: 'menu:close-pane', args: [cb] },
  { ns: 'pane', method: 'onFocusPane', kind: 'listen', channel: 'focus-pane', args: [cb] },
  { ns: 'terminal', method: 'popoutOpen', kind: 'invoke', channel: 'popout:open', args: ['p', 't'], payload: { paneId: 'p', title: 't' } },
  { ns: 'terminal', method: 'popoutConfirmClose', kind: 'send', channel: 'popout:close-confirmed', args: ['id'], payload: { id: 'id' } },
  { ns: 'terminal', method: 'popoutFocus', kind: 'send', channel: 'popout:focus', args: ['id'], payload: { id: 'id' } },
  { ns: 'terminal', method: 'onPopoutKilled', kind: 'listen', channel: 'popout:killed', args: [cb] },
  { ns: 'terminal', method: 'onPopoutConfirmClose', kind: 'listen', channel: 'popout:confirm-close', args: [cb] },
  { ns: 'terminal', method: 'procStart', kind: 'invoke', channel: 'proc:start', args: [{ stableId: 's', command: 'c' }], payload: { stableId: 's', command: 'c' } },
  { ns: 'terminal', method: 'procBuffer', kind: 'invoke', channel: 'proc:buffer', args: ['id'], payload: { id: 'id' } },
  { ns: 'terminal', method: 'procAttach', kind: 'send', channel: 'proc:attach', args: ['id'], payload: { id: 'id' } },
  { ns: 'terminal', method: 'onProcExit', kind: 'listen', channel: 'proc:exit', args: [cb] },

  // ── git ──
  { ns: 'git', method: 'branches', kind: 'invoke', channel: 'git:branches', args: ['id'], payload: { id: 'id' } },
  { ns: 'git', method: 'branchesAt', kind: 'invoke', channel: 'git:branchesAt', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'git', method: 'stashList', kind: 'invoke', channel: 'git:stashList', args: ['id'], payload: { id: 'id' } },
  { ns: 'git', method: 'fileStatus', kind: 'invoke', channel: 'git:fileStatus', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'git', method: 'listWorktrees', kind: 'invoke', channel: 'git:worktrees', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'git', method: 'worktreeState', kind: 'invoke', channel: 'git:worktreeState', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'git', method: 'worktreeAdd', kind: 'invoke', channel: 'git:worktreeAdd', args: ['r', 'p', 'b', 'base'], payload: { repo: 'r', path: 'p', branch: 'b', base: 'base' } },

  // ── fs ──
  { ns: 'dir', method: 'list', kind: 'invoke', channel: 'dir:list', args: ['p'], payload: { path: 'p' } },
  { ns: 'fs', method: 'listEntries', kind: 'invoke', channel: 'fs:listEntries', args: ['p'], payload: { path: 'p' } },
  { ns: 'markdown', method: 'findAll', kind: 'invoke', channel: 'markdown:findAll', args: ['r'], payload: { root: 'r' } },
  { ns: 'fs', method: 'findFiles', kind: 'invoke', channel: 'fs:findFiles', args: ['r', ['x']], payload: { root: 'r', exclude: ['x'] } },
  { ns: 'fs', method: 'resolveFile', kind: 'invoke', channel: 'fs:resolveFile', args: ['b', 'rel'], payload: { base: 'b', rel: 'rel' } },
  { ns: 'fs', method: 'readMd', kind: 'invoke', channel: 'fs:readMd', args: ['p'], payload: { path: 'p' } },
  { ns: 'fs', method: 'readText', kind: 'invoke', channel: 'fs:readText', args: ['p'], payload: { path: 'p' } },
  { ns: 'fs', method: 'writeMd', kind: 'invoke', channel: 'fs:writeMd', args: ['p', 'c'], payload: { path: 'p', content: 'c' } },
  { ns: 'fs', method: 'writeText', kind: 'invoke', channel: 'fs:writeText', args: ['p', 'c'], payload: { path: 'p', content: 'c' } },
  { ns: 'fs', method: 'createFile', kind: 'invoke', channel: 'fs:createFile', args: ['p'], payload: { path: 'p' } },
  { ns: 'fs', method: 'mkdir', kind: 'invoke', channel: 'fs:mkdir', args: ['p'], payload: { path: 'p' } },
  { ns: 'fs', method: 'renamePath', kind: 'invoke', channel: 'fs:rename', args: ['f', 't'], payload: { from: 'f', to: 't' } },
  { ns: 'fs', method: 'trashPath', kind: 'invoke', channel: 'fs:trash', args: ['p'], payload: { path: 'p' } },
  { ns: 'fs', method: 'resolveImport', kind: 'invoke', channel: 'fs:resolveImport', args: ['ff', 'spec', 'sym'], payload: { fromFile: 'ff', spec: 'spec', symbol: 'sym' } },
  { ns: 'ide', method: 'open', kind: 'send', channel: 'ide:open', args: ['p', 'ide'], payload: { path: 'p', ide: 'ide' } },
  { ns: 'shell', method: 'openPath', kind: 'send', channel: 'shell:openPath', args: ['p'], payload: { path: 'p' } },
  { ns: 'shell', method: 'revealPath', kind: 'send', channel: 'shell:revealPath', args: ['p'], payload: { path: 'p' } },
  { ns: 'markdown', method: 'open', kind: 'send', channel: 'markdown:open', args: ['p'], payload: { path: 'p' } },

  // ── claude ──
  { ns: 'claude', method: 'latestSession', kind: 'invoke', channel: 'claude:latestSession', args: ['cwd', 5, 'sid'], payload: { cwd: 'cwd', since: 5, ofSession: 'sid' } },
  { ns: 'claude', method: 'sessionCwd', kind: 'invoke', channel: 'claude:sessionCwd', args: ['s'], payload: { sessionId: 's' } },
  { ns: 'claude', method: 'sessions', kind: 'invoke', channel: 'claude:sessions', args: [], payload: undefined },
  { ns: 'claude', method: 'sessionTitle', kind: 'invoke', channel: 'claude:sessionTitle', args: ['cwd', 's'], payload: { cwd: 'cwd', sessionId: 's' } },
  { ns: 'claude', method: 'sessionStatus', kind: 'invoke', channel: 'claude:sessionStatus', args: ['cwd', 's'], payload: { cwd: 'cwd', sessionId: 's' } },
  { ns: 'claude', method: 'permissionMode', kind: 'invoke', channel: 'claude:permissionMode', args: ['cwd', 's'], payload: { cwd: 'cwd', sessionId: 's' } },
  { ns: 'claude', method: 'watchSessions', kind: 'invoke', channel: 'claude:watchSessions', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'claude', method: 'onSessionsChanged', kind: 'listen', channel: 'claude:sessionsChanged', args: [cb] },
  { ns: 'claude', method: 'usageSummary', kind: 'invoke', channel: 'claude:usageSummary', args: [], payload: undefined },
  { ns: 'claude', method: 'realUsage', kind: 'invoke', channel: 'claude:realUsage', args: [{ force: true }], payload: { force: true } },

  // ── notebook ──
  { ns: 'notebook', method: 'tree', kind: 'invoke', channel: 'notebook:tree', args: [], payload: undefined },
  { ns: 'notebook', method: 'read', kind: 'invoke', channel: 'notebook:read', args: ['p'], payload: { path: 'p' } },
  { ns: 'notebook', method: 'write', kind: 'send', channel: 'notebook:write', args: ['p', 'c'], payload: { path: 'p', content: 'c' } },
  { ns: 'notebook', method: 'mkdir', kind: 'invoke', channel: 'notebook:mkdir', args: ['p'], payload: { path: 'p' } },
  { ns: 'notebook', method: 'create', kind: 'invoke', channel: 'notebook:create', args: ['p'], payload: { path: 'p' } },
  { ns: 'notebook', method: 'rename', kind: 'invoke', channel: 'notebook:rename', args: ['p', 'n'], payload: { path: 'p', name: 'n' } },
  { ns: 'notebook', method: 'move', kind: 'invoke', channel: 'notebook:move', args: ['s', 'd'], payload: { src: 's', destDir: 'd' } },
  { ns: 'notebook', method: 'delete', kind: 'invoke', channel: 'notebook:delete', args: ['p'], payload: { path: 'p' } },
  { ns: 'notebook', method: 'reveal', kind: 'send', channel: 'notebook:reveal', args: ['p'], payload: { path: 'p' } },

  // ── plans ──
  { ns: 'plans', method: 'list', kind: 'invoke', channel: 'plans:list', args: [], payload: undefined },
  { ns: 'plans', method: 'forBranch', kind: 'invoke', channel: 'plans:forBranch', args: ['cwd', 'b'], payload: { cwd: 'cwd', branch: 'b' } },
  { ns: 'plans', method: 'scan', kind: 'invoke', channel: 'plans:scan', args: [['a']], payload: { paths: ['a'] } },
  { ns: 'plans', method: 'onChanged', kind: 'listen', channel: 'plans:changed', args: [cb] },

  // ── db / dbq ──
  { ns: 'db', method: 'connect', kind: 'invoke', channel: 'db:connect', args: [{ id: 'c' }], payload: { config: { id: 'c' } } },
  { ns: 'db', method: 'objects', kind: 'invoke', channel: 'db:objects', args: [{ id: 'c' }], payload: { config: { id: 'c' } } },
  { ns: 'db', method: 'columns', kind: 'invoke', channel: 'db:columns', args: [{ id: 'c' }, 't'], payload: { config: { id: 'c' }, table: 't' } },
  { ns: 'db', method: 'query', kind: 'invoke', channel: 'db:query', args: [{ id: 'c' }, 'sql'], payload: { config: { id: 'c' }, sql: 'sql' } },
  { ns: 'db', method: 'disconnect', kind: 'invoke', channel: 'db:disconnect', args: ['id'], payload: { id: 'id' } },
  { ns: 'dbq', method: 'list', kind: 'invoke', channel: 'dbq:list', args: ['cn'], payload: { connId: 'cn' } },
  { ns: 'dbq', method: 'read', kind: 'invoke', channel: 'dbq:read', args: ['cn', 'n'], payload: { connId: 'cn', name: 'n' } },
  { ns: 'dbq', method: 'write', kind: 'invoke', channel: 'dbq:write', args: ['cn', 'n', 'sql'], payload: { connId: 'cn', name: 'n', sql: 'sql' } },
  { ns: 'dbq', method: 'delete', kind: 'invoke', channel: 'dbq:delete', args: ['cn', 'n'], payload: { connId: 'cn', name: 'n' } },

  // ── docker ──
  { ns: 'docker', method: 'available', kind: 'invoke', channel: 'docker:available', args: [], payload: undefined },
  { ns: 'docker', method: 'containers', kind: 'invoke', channel: 'docker:containers', args: [], payload: undefined },
  { ns: 'docker', method: 'images', kind: 'invoke', channel: 'docker:images', args: [], payload: undefined },
  { ns: 'docker', method: 'volumes', kind: 'invoke', channel: 'docker:volumes', args: [], payload: undefined },
  { ns: 'docker', method: 'networks', kind: 'invoke', channel: 'docker:networks', args: [], payload: undefined },
  { ns: 'docker', method: 'compose', kind: 'invoke', channel: 'docker:compose', args: [], payload: undefined },
  { ns: 'docker', method: 'stats', kind: 'invoke', channel: 'docker:stats', args: [], payload: undefined },
  { ns: 'docker', method: 'inspect', kind: 'invoke', channel: 'docker:inspect', args: ['container', 'id'], payload: { kind: 'container', id: 'id' } },
  { ns: 'docker', method: 'logs', kind: 'invoke', channel: 'docker:logs', args: ['id', 10], payload: { id: 'id', tail: 10 } },
  { ns: 'docker', method: 'action', kind: 'invoke', channel: 'docker:action', args: ['container', 'start', 'id', 'cf'], payload: { kind: 'container', action: 'start', id: 'id', configFile: 'cf' } },
  { ns: 'docker', method: 'prune', kind: 'invoke', channel: 'docker:prune', args: ['t'], payload: { target: 't' } },

  // ── pr / gh ──
  { ns: 'pr', method: 'available', kind: 'invoke', channel: 'pr:available', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'pr', method: 'list', kind: 'invoke', channel: 'pr:list', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'pr', method: 'repos', kind: 'invoke', channel: 'pr:repos', args: ['root'], payload: { root: 'root' } },
  { ns: 'pr', method: 'listAll', kind: 'invoke', channel: 'pr:list-all', args: ['root', ['p']], payload: { root: 'root', paths: ['p'] } },
  { ns: 'pr', method: 'merge', kind: 'invoke', channel: 'pr:merge', args: ['cwd', 1, 'squash'], payload: { cwd: 'cwd', number: 1, method: 'squash' } },
  { ns: 'pr', method: 'view', kind: 'invoke', channel: 'pr:view', args: ['cwd', 1], payload: { cwd: 'cwd', number: 1 } },
  { ns: 'pr', method: 'diff', kind: 'invoke', channel: 'pr:diff', args: ['cwd', 1], payload: { cwd: 'cwd', number: 1 } },
  { ns: 'pr', method: 'comment', kind: 'invoke', channel: 'pr:comment', args: ['cwd', 1, 'p', 2, 3, 'b'], payload: { cwd: 'cwd', number: 1, path: 'p', startLine: 2, endLine: 3, body: 'b' } },
  { ns: 'pr', method: 'runs', kind: 'invoke', channel: 'gh:runs', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'pr', method: 'runJobs', kind: 'invoke', channel: 'gh:run-jobs', args: ['cwd', 1], payload: { cwd: 'cwd', id: 1 } },
  { ns: 'pr', method: 'deployments', kind: 'invoke', channel: 'gh:deployments', args: ['cwd'], payload: { cwd: 'cwd' } },
  { ns: 'pr', method: 'deploysAll', kind: 'invoke', channel: 'gh:deploys-all', args: ['root', ['p']], payload: { root: 'root', paths: ['p'] } },

  // ── secrets ──
  { ns: 'secrets', method: 'available', kind: 'invoke', channel: 'secrets:available', args: [], payload: undefined },
  { ns: 'secrets', method: 'get', kind: 'invoke', channel: 'secrets:get', args: ['e', 'k'], payload: { entryId: 'e', key: 'k' } },
  { ns: 'secrets', method: 'set', kind: 'invoke', channel: 'secrets:set', args: ['e', 'k', 'v'], payload: { entryId: 'e', key: 'k', value: 'v' } },
  { ns: 'secrets', method: 'delete', kind: 'invoke', channel: 'secrets:delete', args: ['e', 'k'], payload: { entryId: 'e', key: 'k' } },

  // ── ios ──
  { ns: 'ios', method: 'worktreeScript', kind: 'invoke', channel: 'iosWorktree:scriptPath', args: [], payload: undefined },
  { ns: 'ios', method: 'worktreeReport', kind: 'invoke', channel: 'iosWorktree:report', args: ['r', {}], payload: { repoRoot: 'r', cfg: {} } },
  { ns: 'ios', method: 'worktreeStop', kind: 'invoke', channel: 'iosWorktree:stop', args: ['wp', {}], payload: { worktreePath: 'wp', cfg: {} } },
  { ns: 'ios', method: 'simShutdown', kind: 'invoke', channel: 'ios:simShutdown', args: ['udid'], payload: { udid: 'udid' } },
  { ns: 'ios', method: 'simErase', kind: 'invoke', channel: 'ios:simErase', args: ['udid'], payload: { udid: 'udid' } },
  { ns: 'ios', method: 'appUninstall', kind: 'invoke', channel: 'ios:appUninstall', args: ['udid', 'bid', 'simulator'], payload: { udid: 'udid', bundleId: 'bid', kind: 'simulator' } },
  { ns: 'ios', method: 'listTargets', kind: 'invoke', channel: 'ios:listTargets', args: [], payload: undefined },
  { ns: 'ios', method: 'listSchemes', kind: 'invoke', channel: 'ios:listSchemes', args: ['r', {}], payload: { repoRoot: 'r', cfg: {} } },

  // ── app / deploy / monaco / zsh / todo / backlog / sound / improve-window ──
  { ns: 'app', method: 'version', kind: 'invoke', channel: 'app:version', args: [], payload: undefined },
  { ns: 'app', method: 'buildInfo', kind: 'invoke', channel: 'app:buildInfo', args: [], payload: undefined },
  { ns: 'app', method: 'buildCounter', kind: 'invoke', channel: 'app:buildCounter', args: ['rp'], payload: { repoPath: 'rp' } },
  { ns: 'app', method: 'repoGit', kind: 'invoke', channel: 'app:repoGit', args: ['rp'], payload: { repoPath: 'rp' } },
  { ns: 'deploy', method: 'build', kind: 'invoke', channel: 'deploy:build', args: ['rp', 'c'], payload: { repoPath: 'rp', command: 'c' } },
  { ns: 'deploy', method: 'killAllPtys', kind: 'invoke', channel: 'deploy:killAllPtys', args: [], payload: undefined },
  { ns: 'deploy', method: 'swap', kind: 'invoke', channel: 'deploy:swap', args: ['rp'], payload: { repoPath: 'rp' } },
  { ns: 'deploy', method: 'wasUpdating', kind: 'invoke', channel: 'deploy:wasUpdating', args: [], payload: undefined },
  { ns: 'app', method: 'openExternal', kind: 'send', channel: 'open-external', args: ['u'], payload: { url: 'u' } },
  { ns: 'app', method: 'notify', kind: 'send', channel: 'notify', args: ['t', 'b', 'p'], payload: { title: 't', body: 'b', paneId: 'p' } },
  { ns: 'monaco', method: 'theme', kind: 'invoke', channel: 'monaco:theme', args: ['n'], payload: { name: 'n' } },
  { ns: 'zsh', method: 'commands', kind: 'invoke', channel: 'zsh:commands', args: [], payload: undefined },
  { ns: 'todo', method: 'read', kind: 'invoke', channel: 'todo:read', args: ['p'], payload: { path: 'p' } },
  { ns: 'todo', method: 'write', kind: 'invoke', channel: 'todo:write', args: ['p', 'c'], payload: { path: 'p', content: 'c' } },
  { ns: 'backlog', method: 'read', kind: 'invoke', channel: 'backlog:read', args: [], payload: undefined },
  { ns: 'sound', method: 'play', kind: 'send', channel: 'sound:play', args: ['n'], payload: { name: 'n' } },
  { ns: 'sound', method: 'playEvent', kind: 'send', channel: 'sound:event', args: ['done'], payload: { event: 'done' } },
  { ns: 'app', method: 'onAppQuitting', kind: 'listen', channel: 'app:quitting', args: [cb] },
  { ns: 'app', method: 'onFullscreenChange', kind: 'listen', channel: 'window:fullscreen', args: [cb] },
  { ns: 'app', method: 'openImproveWindow', kind: 'invoke', channel: 'improve-window:open', args: [], payload: undefined },
  { ns: 'app', method: 'improveWindowSetAlwaysOnTop', kind: 'send', channel: 'improve-window:set-always-on-top', args: [true], payload: { value: true } },

  // ── store ──
  { ns: 'store', method: 'load', kind: 'invoke', channel: 'store:load', args: [], payload: undefined },
  { ns: 'store', method: 'save', kind: 'send', channel: 'store:save', args: [{ theme: 'x' }], payload: { theme: 'x' } }
]

// Loosely typed for the data-driven loop; each method is precisely typed at its
// own call site, which is irrelevant to the channel routing being asserted.
const SERVICES: Record<string, Record<string, (...a: unknown[]) => unknown>> = {
  terminal: terminalService,
  pane: paneService,
  git: gitService,
  fs: fsService,
  dir: dirService,
  ide: ideService,
  shell: shellService,
  markdown: markdownService,
  claude: claudeService,
  notebook: notebookService,
  plans: plansService,
  db: dbService,
  dbq: dbqService,
  docker: dockerService,
  pr: prService,
  secrets: secretsService,
  ios: iosService,
  app: appService,
  deploy: deployService,
  monaco: monacoService,
  zsh: zshService,
  todo: todoService,
  backlog: backlogService,
  sound: soundService,
  store: storeService
} as unknown as Record<string, Record<string, (...a: unknown[]) => unknown>>

for (const e of ENTRIES) {
  describe(`${e.ns}Service.${e.method}`, () => {
    it(`routes to ${e.kind} '${e.channel}'`, () => {
      const ret = SERVICES[e.ns][e.method](...e.args)
      if (e.kind === 'invoke') {
        expect(invoke).toHaveBeenCalledWith(e.channel, e.payload)
        expect(send).not.toHaveBeenCalled()
        expect(ret).toBe('RESULT') // bridge result passes through untouched
      } else if (e.kind === 'send') {
        expect(send).toHaveBeenCalledWith(e.channel, e.payload)
        expect(invoke).not.toHaveBeenCalled()
      } else {
        expect(on).toHaveBeenCalledWith(e.channel, expect.any(Function))
      }
    })
  })
}

it('every service method is covered by the entry table', () => {
  const covered = new Set(ENTRIES.map((e) => `${e.ns}.${e.method}`))
  // BaseClient (the class-based clients, e.g. claudeService) provides these as
  // instance fields; they're framework plumbing, not service API methods.
  const BASE_CLIENT_PLUMBING = new Set(['call', 'send', 'listen'])
  for (const [ns, svc] of Object.entries(SERVICES)) {
    for (const method of Object.keys(svc)) {
      if (BASE_CLIENT_PLUMBING.has(method)) continue
      expect(covered.has(`${ns}.${method}`), `${ns}.${method} missing from ENTRIES`).toBe(true)
    }
  }
})
