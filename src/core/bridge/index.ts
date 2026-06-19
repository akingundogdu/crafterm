import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { CraftermApi } from './api'

// The renderer (web) can only touch the shell through this narrow, typed bridge.
// Methods are grouped by domain namespace (crafterm.git.*, crafterm.pty.*, …);
// the renderer's services/ipc/* wrappers forward straight through.
const api: CraftermApi = {
  terminal: {
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
    adoptPane: (id) => ipcRenderer.send('pty:adopt', { id }),
    paneInfo: (id, stableId) => ipcRenderer.invoke('pane:info', { id, stableId }),
    onCloseActivePane: (cb) => ipcRenderer.on('menu:close-pane', () => cb()),
    onFocusPane: (cb) =>
      ipcRenderer.on('focus-pane', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
    popoutOpen: (paneId, title) => ipcRenderer.invoke('popout:open', { paneId, title }),
    popoutConfirmClose: (id) => ipcRenderer.send('popout:close-confirmed', { id }),
    popoutFocus: (id) => ipcRenderer.send('popout:focus', { id }),
    onPopoutKilled: (cb) =>
      ipcRenderer.on('popout:killed', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
    onPopoutConfirmClose: (cb) =>
      ipcRenderer.on('popout:confirm-close', (_e: IpcRendererEvent, p: { id: string }) =>
        cb(p.id)
      ),
    procStart: (opts) => ipcRenderer.invoke('proc:start', opts),
    procBuffer: (id) => ipcRenderer.invoke('proc:buffer', { id }),
    procAttach: (id) => ipcRenderer.send('proc:attach', { id }),
    onProcExit: (cb) =>
      ipcRenderer.on('proc:exit', (_e: IpcRendererEvent, p: { id: string; code: number }) =>
        cb(p.id, p.code)
      )
  },
  git: {
    branches: (id) => ipcRenderer.invoke('git:branches', { id }),
    stashList: (id) => ipcRenderer.invoke('git:stashList', { id }),
    fileStatus: (cwd) => ipcRenderer.invoke('git:fileStatus', { cwd }),
    listWorktrees: (cwd) => ipcRenderer.invoke('git:worktrees', { cwd }),
    worktreeAdd: (repo, path, branch, base) =>
      ipcRenderer.invoke('git:worktreeAdd', { repo, path, branch, base })
  },
  fs: {
    listDir: (path) => ipcRenderer.invoke('dir:list', { path }),
    listEntries: (path) => ipcRenderer.invoke('fs:listEntries', { path }),
    findAllMarkdown: (root) => ipcRenderer.invoke('md:findAll', { root }),
    findFiles: (root, exclude) => ipcRenderer.invoke('fs:findFiles', { root, exclude }),
    resolveFile: (base, rel) => ipcRenderer.invoke('fs:resolveFile', { base, rel }),
    readMd: (path) => ipcRenderer.invoke('fs:readMd', { path }),
    readText: (path) => ipcRenderer.invoke('fs:readText', { path }),
    writeMd: (path, content) => ipcRenderer.invoke('fs:writeMd', { path, content }),
    writeText: (path, content) => ipcRenderer.invoke('fs:writeText', { path, content }),
    createFile: (path) => ipcRenderer.invoke('fs:createFile', { path }),
    mkdir: (path) => ipcRenderer.invoke('fs:mkdir', { path }),
    renamePath: (from, to) => ipcRenderer.invoke('fs:rename', { from, to }),
    trashPath: (path) => ipcRenderer.invoke('fs:trash', { path }),
    resolveImport: (fromFile, spec, symbol) =>
      ipcRenderer.invoke('fs:resolveImport', { fromFile, spec, symbol }),
    ideOpen: (path, ide) => ipcRenderer.send('ide:open', { path, ide }),
    openPath: (path) => ipcRenderer.send('shell:openPath', { path }),
    revealPath: (path) => ipcRenderer.send('shell:revealPath', { path }),
    openMarkdown: (path) => ipcRenderer.send('markdown:open', { path })
  },
  claude: {
    latestSession: (cwd, since) => ipcRenderer.invoke('claude:latestSession', { cwd, since }),
    sessionCwd: (sessionId) => ipcRenderer.invoke('claude:sessionCwd', { sessionId }),
    sessions: () => ipcRenderer.invoke('claude:sessions'),
    sessionTitle: (cwd, sessionId) => ipcRenderer.invoke('claude:sessionTitle', { cwd, sessionId }),
    sessionStatus: (cwd, sessionId) =>
      ipcRenderer.invoke('claude:sessionStatus', { cwd, sessionId }),
    permissionMode: (cwd, sessionId) =>
      ipcRenderer.invoke('claude:permissionMode', { cwd, sessionId }),
    watchSessions: (cwd) => ipcRenderer.invoke('claude:watchSessions', { cwd }),
    onSessionsChanged: (cb) => {
      const listener = (_e: IpcRendererEvent, p: { cwd: string }): void => cb(p.cwd)
      ipcRenderer.on('claude:sessionsChanged', listener)
      return () => ipcRenderer.removeListener('claude:sessionsChanged', listener)
    },
    usageSummary: () => ipcRenderer.invoke('claude:usageSummary'),
    realUsage: (opts) => ipcRenderer.invoke('claude:realUsage', opts)
  },
  notebook: {
    tree: () => ipcRenderer.invoke('notebook:tree'),
    read: (path) => ipcRenderer.invoke('notebook:read', { path }),
    write: (path, content) => ipcRenderer.send('notebook:write', { path, content }),
    mkdir: (path) => ipcRenderer.invoke('notebook:mkdir', { path }),
    create: (path) => ipcRenderer.invoke('notebook:create', { path }),
    rename: (path, name) => ipcRenderer.invoke('notebook:rename', { path, name }),
    move: (src, destDir) => ipcRenderer.invoke('notebook:move', { src, destDir }),
    delete: (path) => ipcRenderer.invoke('notebook:delete', { path }),
    reveal: (path) => ipcRenderer.send('notebook:reveal', { path })
  },
  plans: {
    list: () => ipcRenderer.invoke('plans:list'),
    forBranch: (cwd, branch) => ipcRenderer.invoke('plans:forBranch', { cwd, branch }),
    scan: (paths) => ipcRenderer.invoke('plans:scan', { paths }),
    onChanged: (cb) => {
      const listener = (_e: IpcRendererEvent, p: { plansDir: string }): void => cb(p.plansDir)
      ipcRenderer.on('plans:changed', listener)
      return () => ipcRenderer.removeListener('plans:changed', listener)
    }
  },
  db: {
    connect: (config) => ipcRenderer.invoke('db:connect', { config }),
    objects: (config) => ipcRenderer.invoke('db:objects', { config }),
    columns: (config, table) => ipcRenderer.invoke('db:columns', { config, table }),
    query: (config, sql) => ipcRenderer.invoke('db:query', { config, sql }),
    disconnect: (id) => ipcRenderer.invoke('db:disconnect', { id }),
    savedList: (connId) => ipcRenderer.invoke('dbq:list', { connId }),
    savedRead: (connId, name) => ipcRenderer.invoke('dbq:read', { connId, name }),
    savedWrite: (connId, name, sql) => ipcRenderer.invoke('dbq:write', { connId, name, sql }),
    savedDelete: (connId, name) => ipcRenderer.invoke('dbq:delete', { connId, name })
  },
  docker: {
    available: () => ipcRenderer.invoke('docker:available'),
    containers: () => ipcRenderer.invoke('docker:containers'),
    images: () => ipcRenderer.invoke('docker:images'),
    volumes: () => ipcRenderer.invoke('docker:volumes'),
    networks: () => ipcRenderer.invoke('docker:networks'),
    compose: () => ipcRenderer.invoke('docker:compose'),
    stats: () => ipcRenderer.invoke('docker:stats'),
    inspect: (kind, id) => ipcRenderer.invoke('docker:inspect', { kind, id }),
    logs: (id, tail) => ipcRenderer.invoke('docker:logs', { id, tail }),
    action: (kind, action, id, configFile) =>
      ipcRenderer.invoke('docker:action', { kind, action, id, configFile }),
    prune: (target) => ipcRenderer.invoke('docker:prune', { target })
  },
  pr: {
    available: (cwd) => ipcRenderer.invoke('pr:available', { cwd }),
    list: (cwd) => ipcRenderer.invoke('pr:list', { cwd }),
    repos: (root) => ipcRenderer.invoke('pr:repos', { root }),
    listAll: (root, paths) => ipcRenderer.invoke('pr:list-all', { root, paths }),
    merge: (cwd, number, method) => ipcRenderer.invoke('pr:merge', { cwd, number, method }),
    view: (cwd, number) => ipcRenderer.invoke('pr:view', { cwd, number }),
    diff: (cwd, number) => ipcRenderer.invoke('pr:diff', { cwd, number }),
    comment: (cwd, number, path, startLine, endLine, body) =>
      ipcRenderer.invoke('pr:comment', { cwd, number, path, startLine, endLine, body }),
    runs: (cwd) => ipcRenderer.invoke('gh:runs', { cwd }),
    runJobs: (cwd, id) => ipcRenderer.invoke('gh:run-jobs', { cwd, id }),
    deployments: (cwd) => ipcRenderer.invoke('gh:deployments', { cwd }),
    deploysAll: (root, paths) => ipcRenderer.invoke('gh:deploys-all', { root, paths })
  },
  secrets: {
    available: () => ipcRenderer.invoke('secrets:available'),
    get: (entryId, key) => ipcRenderer.invoke('secrets:get', { entryId, key }),
    set: (entryId, key, value) => ipcRenderer.invoke('secrets:set', { entryId, key, value }),
    delete: (entryId, key) => ipcRenderer.invoke('secrets:delete', { entryId, key })
  },
  ios: {
    worktreeScript: () => ipcRenderer.invoke('iosWorktree:scriptPath'),
    worktreeReport: (repoRoot, cfg) => ipcRenderer.invoke('iosWorktree:report', { repoRoot, cfg }),
    worktreeStop: (worktreePath, cfg) =>
      ipcRenderer.invoke('iosWorktree:stop', { worktreePath, cfg }),
    listTargets: () => ipcRenderer.invoke('ios:listTargets'),
    listSchemes: (repoRoot, cfg) => ipcRenderer.invoke('ios:listSchemes', { repoRoot, cfg })
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    buildInfo: () => ipcRenderer.invoke('app:buildInfo'),
    buildCounter: (repoPath) => ipcRenderer.invoke('app:buildCounter', { repoPath }),
    repoGit: (repoPath) => ipcRenderer.invoke('app:repoGit', { repoPath }),
    deployBuild: (repoPath, command) => ipcRenderer.invoke('deploy:build', { repoPath, command }),
    deployKillAllPtys: () => ipcRenderer.invoke('deploy:killAllPtys'),
    deploySwap: (repoPath) => ipcRenderer.invoke('deploy:swap', { repoPath }),
    deployWasUpdating: () => ipcRenderer.invoke('deploy:wasUpdating'),
    openExternal: (url) => ipcRenderer.send('open-external', { url }),
    notify: (title, body, paneId) => ipcRenderer.send('notify', { title, body, paneId }),
    monacoTheme: (name) => ipcRenderer.invoke('monaco:theme', { name }),
    zshCommands: () => ipcRenderer.invoke('zsh:commands'),
    todoRead: (path) => ipcRenderer.invoke('todo:read', { path }),
    todoWrite: (path, content) => ipcRenderer.invoke('todo:write', { path, content }),
    backlogRead: () => ipcRenderer.invoke('backlog:read'),
    playSound: (name) => ipcRenderer.send('sound:play', { name }),
    playEventSound: (event) => ipcRenderer.send('sound:event', { event }),
    onAppQuitting: (cb) => ipcRenderer.on('app:quitting', () => cb()),
    onFullscreenChange: (cb) =>
      ipcRenderer.on('window:fullscreen', (_e: IpcRendererEvent, isFull: boolean) => cb(isFull)),
    openImproveWindow: () => ipcRenderer.invoke('improve-window:open'),
    improveWindowSetAlwaysOnTop: (value) =>
      ipcRenderer.send('improve-window:set-always-on-top', { value })
  },
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.send('store:save', data)
  }
}

contextBridge.exposeInMainWorld('crafterm', api)
