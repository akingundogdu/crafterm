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
  adoptPane: (id) => ipcRenderer.send('pty:adopt', { id }),
  popoutOpen: (paneId, title) => ipcRenderer.invoke('popout:open', { paneId, title }),
  popoutConfirmClose: (id) => ipcRenderer.send('popout:close-confirmed', { id }),
  popoutFocus: (id) => ipcRenderer.send('popout:focus', { id }),
  onPopoutKilled: (cb) =>
    ipcRenderer.on('popout:killed', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  onPopoutConfirmClose: (cb) =>
    ipcRenderer.on('popout:confirm-close', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  loadState: () => ipcRenderer.invoke('store:load'),
  saveState: (data) => ipcRenderer.send('store:save', data),
  paneInfo: (id) => ipcRenderer.invoke('pane:info', { id }),
  notify: (title, body, paneId) => ipcRenderer.send('notify', { title, body, paneId }),
  onFocusPane: (cb) =>
    ipcRenderer.on('focus-pane', (_e: IpcRendererEvent, p: { id: string }) => cb(p.id)),
  openExternal: (url) => ipcRenderer.send('open-external', { url }),
  onCloseActivePane: (cb) => ipcRenderer.on('menu:close-pane', () => cb()),
  onAppQuitting: (cb) => ipcRenderer.on('app:quitting', () => cb()),
  listDir: (path) => ipcRenderer.invoke('dir:list', { path }),
  listEntries: (path) => ipcRenderer.invoke('fs:listEntries', { path }),
  ideOpen: (path, ide) => ipcRenderer.send('ide:open', { path, ide }),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  openMarkdown: (path) => ipcRenderer.send('markdown:open', { path }),
  listWorktrees: (cwd) => ipcRenderer.invoke('git:worktrees', { cwd }),
  nbTree: () => ipcRenderer.invoke('notebook:tree'),
  nbRead: (path) => ipcRenderer.invoke('notebook:read', { path }),
  nbWrite: (path, content) => ipcRenderer.send('notebook:write', { path, content }),
  nbMkdir: (path) => ipcRenderer.invoke('notebook:mkdir', { path }),
  nbCreate: (path) => ipcRenderer.invoke('notebook:create', { path }),
  nbRename: (path, name) => ipcRenderer.invoke('notebook:rename', { path, name }),
  nbDelete: (path) => ipcRenderer.invoke('notebook:delete', { path }),
  nbReveal: (path) => ipcRenderer.send('notebook:reveal', { path }),
  openPath: (path) => ipcRenderer.send('shell:openPath', { path }),
  playSound: (name) => ipcRenderer.send('sound:play', { name }),
  playEventSound: (event) => ipcRenderer.send('sound:event', { event }),
  findAllMarkdown: (root) => ipcRenderer.invoke('md:findAll', { root }),
  findFiles: (root, exclude) => ipcRenderer.invoke('fs:findFiles', { root, exclude }),
  resolveFile: (base, rel) => ipcRenderer.invoke('fs:resolveFile', { base, rel }),
  readMd: (path) => ipcRenderer.invoke('fs:readMd', { path }),
  writeMd: (path, content) => ipcRenderer.invoke('fs:writeMd', { path, content }),
  gitStashList: (id) => ipcRenderer.invoke('git:stashList', { id }),
  gitBranches: (id) => ipcRenderer.invoke('git:branches', { id }),
  claudeLatestSession: (cwd) => ipcRenderer.invoke('claude:latestSession', { cwd }),
  claudeSessions: () => ipcRenderer.invoke('claude:sessions'),
  todoRead: (path) => ipcRenderer.invoke('todo:read', { path }),
  todoWrite: (path, content) => ipcRenderer.invoke('todo:write', { path, content }),
  zshCommands: () => ipcRenderer.invoke('zsh:commands')
}

contextBridge.exposeInMainWorld('crafterm', api)
