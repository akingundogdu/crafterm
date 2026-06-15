import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { CraftermApi } from './api'

// The renderer (web) can only touch the shell through this narrow, typed bridge.
const api: CraftermApi = {
  createPty: (opts) => ipcRenderer.invoke('pty:create', opts),
  input: (id, data) => ipcRenderer.send('pty:input', { id, data }),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),
  kill: (id) => ipcRenderer.send('pty:kill', { id }),
  onData: (cb) =>
    ipcRenderer.on('pty:data', (_e: IpcRendererEvent, p: { id: string; data: string }) =>
      cb(p.id, p.data)
    ),
  onExit: (cb) =>
    ipcRenderer.on('pty:exit', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  procStart: (opts) => ipcRenderer.invoke('proc:start', opts),
  procBuffer: (id) => ipcRenderer.invoke('proc:buffer', { id }),
  procAttach: (id) => ipcRenderer.send('proc:attach', { id }),
  onProcExit: (cb) =>
    ipcRenderer.on('proc:exit', (_e: IpcRendererEvent, p: { id: string; code: number }) =>
      cb(p.id, p.code)
    ),
  adoptPane: (id) => ipcRenderer.send('pty:adopt', { id }),
  popoutOpen: (paneId, title) => ipcRenderer.invoke('popout:open', { paneId, title }),
  popoutConfirmClose: (id) => ipcRenderer.send('popout:close-confirmed', { id }),
  popoutFocus: (id) => ipcRenderer.send('popout:focus', { id }),
  onPopoutKilled: (cb) =>
    ipcRenderer.on('popout:killed', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  onPopoutConfirmClose: (cb) =>
    ipcRenderer.on('popout:confirm-close', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  openImproveWindow: () => ipcRenderer.invoke('improve-window:open'),
  improveWindowSetAlwaysOnTop: (value) =>
    ipcRenderer.send('improve-window:set-always-on-top', { value }),
  loadState: () => ipcRenderer.invoke('store:load'),
  saveState: (data) => ipcRenderer.send('store:save', data),
  paneInfo: (id, stableId) => ipcRenderer.invoke('pane:info', { id, stableId }),
  notify: (title, body, paneId) => ipcRenderer.send('notify', { title, body, paneId }),
  onFocusPane: (cb) =>
    ipcRenderer.on('focus-pane', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  openExternal: (url) => ipcRenderer.send('open-external', { url }),
  onCloseActivePane: (cb) => ipcRenderer.on('menu:close-pane', () => cb()),
  onAppQuitting: (cb) => ipcRenderer.on('app:quitting', () => cb()),
  onFullscreenChange: (cb) =>
    ipcRenderer.on('window:fullscreen', (_e: IpcRendererEvent, isFull: boolean) => cb(isFull)),
  listDir: (path) => ipcRenderer.invoke('dir:list', { path }),
  listEntries: (path) => ipcRenderer.invoke('fs:listEntries', { path }),
  ideOpen: (path, ide) => ipcRenderer.send('ide:open', { path, ide }),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  plansForBranch: (cwd, branch) => ipcRenderer.invoke('plans:forBranch', { cwd, branch }),
  scanPlans: (paths) => ipcRenderer.invoke('plans:scan', { paths }),
  onPlansChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, p: { plansDir: string }): void => cb(p.plansDir)
    ipcRenderer.on('plans:changed', listener)
    return () => ipcRenderer.removeListener('plans:changed', listener)
  },
  openMarkdown: (path) => ipcRenderer.send('markdown:open', { path }),
  listWorktrees: (cwd) => ipcRenderer.invoke('git:worktrees', { cwd }),
  worktreeAdd: (repo, path, branch, base) =>
    ipcRenderer.invoke('git:worktreeAdd', { repo, path, branch, base }),
  iosWorktreeScript: () => ipcRenderer.invoke('iosWorktree:scriptPath'),
  iosWorktreeReport: (repoRoot, cfg) => ipcRenderer.invoke('iosWorktree:report', { repoRoot, cfg }),
  iosWorktreeStop: (worktreePath, cfg) => ipcRenderer.invoke('iosWorktree:stop', { worktreePath, cfg }),
  iosListTargets: () => ipcRenderer.invoke('ios:listTargets'),
  iosListSchemes: (repoRoot, cfg) => ipcRenderer.invoke('ios:listSchemes', { repoRoot, cfg }),
  nbTree: () => ipcRenderer.invoke('notebook:tree'),
  nbRead: (path) => ipcRenderer.invoke('notebook:read', { path }),
  nbWrite: (path, content) => ipcRenderer.send('notebook:write', { path, content }),
  nbMkdir: (path) => ipcRenderer.invoke('notebook:mkdir', { path }),
  nbCreate: (path) => ipcRenderer.invoke('notebook:create', { path }),
  nbRename: (path, name) => ipcRenderer.invoke('notebook:rename', { path, name }),
  nbMove: (src, destDir) => ipcRenderer.invoke('notebook:move', { src, destDir }),
  nbDelete: (path) => ipcRenderer.invoke('notebook:delete', { path }),
  nbReveal: (path) => ipcRenderer.send('notebook:reveal', { path }),
  openPath: (path) => ipcRenderer.send('shell:openPath', { path }),
  revealPath: (path) => ipcRenderer.send('shell:revealPath', { path }),
  playSound: (name) => ipcRenderer.send('sound:play', { name }),
  playEventSound: (event) => ipcRenderer.send('sound:event', { event }),
  findAllMarkdown: (root) => ipcRenderer.invoke('md:findAll', { root }),
  findFiles: (root, exclude) => ipcRenderer.invoke('fs:findFiles', { root, exclude }),
  resolveFile: (base, rel) => ipcRenderer.invoke('fs:resolveFile', { base, rel }),
  readMd: (path) => ipcRenderer.invoke('fs:readMd', { path }),
  readText: (path) => ipcRenderer.invoke('fs:readText', { path }),
  writeMd: (path, content) => ipcRenderer.invoke('fs:writeMd', { path, content }),
  writeText: (path, content) => ipcRenderer.invoke('fs:writeText', { path, content }),
  gitFileStatus: (cwd) => ipcRenderer.invoke('git:fileStatus', { cwd }),
  createFile: (path) => ipcRenderer.invoke('fs:createFile', { path }),
  mkdir: (path) => ipcRenderer.invoke('fs:mkdir', { path }),
  renamePath: (from, to) => ipcRenderer.invoke('fs:rename', { from, to }),
  trashPath: (path) => ipcRenderer.invoke('fs:trash', { path }),
  monacoTheme: (name) => ipcRenderer.invoke('monaco:theme', { name }),
  resolveImport: (fromFile, spec, symbol) =>
    ipcRenderer.invoke('fs:resolveImport', { fromFile, spec, symbol }),
  gitStashList: (id) => ipcRenderer.invoke('git:stashList', { id }),
  gitBranches: (id) => ipcRenderer.invoke('git:branches', { id }),
  claudeLatestSession: (cwd, since) => ipcRenderer.invoke('claude:latestSession', { cwd, since }),
  claudeSessionCwd: (sessionId) => ipcRenderer.invoke('claude:sessionCwd', { sessionId }),
  claudeSessions: () => ipcRenderer.invoke('claude:sessions'),
  claudeSessionTitle: (cwd, sessionId) =>
    ipcRenderer.invoke('claude:sessionTitle', { cwd, sessionId }),
  claudeSessionStatus: (cwd, sessionId) =>
    ipcRenderer.invoke('claude:sessionStatus', { cwd, sessionId }),
  claudePermissionMode: (cwd, sessionId) =>
    ipcRenderer.invoke('claude:permissionMode', { cwd, sessionId }),
  watchClaudeSessions: (cwd) => ipcRenderer.invoke('claude:watchSessions', { cwd }),
  onClaudeSessionsChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, p: { cwd: string }): void => cb(p.cwd)
    ipcRenderer.on('claude:sessionsChanged', listener)
    return () => ipcRenderer.removeListener('claude:sessionsChanged', listener)
  },
  claudeUsageSummary: () => ipcRenderer.invoke('claude:usageSummary'),
  claudeRealUsage: (opts) => ipcRenderer.invoke('claude:realUsage', opts),
  secretsAvailable: () => ipcRenderer.invoke('secrets:available'),
  secretGet: (entryId, key) => ipcRenderer.invoke('secrets:get', { entryId, key }),
  secretSet: (entryId, key, value) => ipcRenderer.invoke('secrets:set', { entryId, key, value }),
  secretDelete: (entryId, key) => ipcRenderer.invoke('secrets:delete', { entryId, key }),
  todoRead: (path) => ipcRenderer.invoke('todo:read', { path }),
  todoWrite: (path, content) => ipcRenderer.invoke('todo:write', { path, content }),
  backlogRead: () => ipcRenderer.invoke('backlog:read'),
  zshCommands: () => ipcRenderer.invoke('zsh:commands'),
  dbConnect: (config) => ipcRenderer.invoke('db:connect', { config }),
  dbObjects: (config) => ipcRenderer.invoke('db:objects', { config }),
  dbColumns: (config, table) => ipcRenderer.invoke('db:columns', { config, table }),
  dbQuery: (config, sql) => ipcRenderer.invoke('db:query', { config, sql }),
  dbDisconnect: (id) => ipcRenderer.invoke('db:disconnect', { id }),
  dbqList: (connId) => ipcRenderer.invoke('dbq:list', { connId }),
  dbqRead: (connId, name) => ipcRenderer.invoke('dbq:read', { connId, name }),
  dbqWrite: (connId, name, sql) => ipcRenderer.invoke('dbq:write', { connId, name, sql }),
  dbqDelete: (connId, name) => ipcRenderer.invoke('dbq:delete', { connId, name }),
  appVersion: () => ipcRenderer.invoke('app:version'),
  appBuildInfo: () => ipcRenderer.invoke('app:buildInfo'),
  appBuildCounter: (repoPath) => ipcRenderer.invoke('app:buildCounter', { repoPath }),
  repoGit: (repoPath) => ipcRenderer.invoke('app:repoGit', { repoPath }),
  deployBuild: (repoPath, command) => ipcRenderer.invoke('deploy:build', { repoPath, command }),
  deployKillAllPtys: () => ipcRenderer.invoke('deploy:killAllPtys'),
  deploySwap: (repoPath) => ipcRenderer.invoke('deploy:swap', { repoPath }),
  deployWasUpdating: () => ipcRenderer.invoke('deploy:wasUpdating'),
  dockerAvailable: () => ipcRenderer.invoke('docker:available'),
  dockerContainers: () => ipcRenderer.invoke('docker:containers'),
  dockerImages: () => ipcRenderer.invoke('docker:images'),
  dockerVolumes: () => ipcRenderer.invoke('docker:volumes'),
  dockerNetworks: () => ipcRenderer.invoke('docker:networks'),
  dockerCompose: () => ipcRenderer.invoke('docker:compose'),
  dockerStats: () => ipcRenderer.invoke('docker:stats'),
  dockerInspect: (kind, id) => ipcRenderer.invoke('docker:inspect', { kind, id }),
  dockerLogs: (id, tail) => ipcRenderer.invoke('docker:logs', { id, tail }),
  dockerAction: (kind, action, id, configFile) =>
    ipcRenderer.invoke('docker:action', { kind, action, id, configFile }),
  dockerPrune: (target) => ipcRenderer.invoke('docker:prune', { target }),
  prAvailable: (cwd) => ipcRenderer.invoke('pr:available', { cwd }),
  prList: (cwd) => ipcRenderer.invoke('pr:list', { cwd }),
  prRepos: (root) => ipcRenderer.invoke('pr:repos', { root }),
  prListAll: (root, paths) => ipcRenderer.invoke('pr:list-all', { root, paths }),
  prMerge: (cwd, number, method) => ipcRenderer.invoke('pr:merge', { cwd, number, method }),
  prView: (cwd, number) => ipcRenderer.invoke('pr:view', { cwd, number }),
  prDiff: (cwd, number) => ipcRenderer.invoke('pr:diff', { cwd, number }),
  prComment: (cwd, number, path, startLine, endLine, body) =>
    ipcRenderer.invoke('pr:comment', { cwd, number, path, startLine, endLine, body }),
  ghRuns: (cwd) => ipcRenderer.invoke('gh:runs', { cwd }),
  ghRunJobs: (cwd, id) => ipcRenderer.invoke('gh:run-jobs', { cwd, id }),
  ghDeployments: (cwd) => ipcRenderer.invoke('gh:deployments', { cwd }),
  ghDeploysAll: (root, paths) => ipcRenderer.invoke('gh:deploys-all', { root, paths })
}

contextBridge.exposeInMainWorld('crafterm', api)
