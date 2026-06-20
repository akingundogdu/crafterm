import { settings, state, panes } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { openMarkdownFile, openCodeEditor } from '@ui/commands/commands'
import { createTreeView, type TreeAdapter, type TreeView, type TreeMenuItem } from '@ui/components'
import { promptText, promptConfirm } from '@ui/components/dialog/dialog'
import type { SidebarNode } from '@ui/types/types'
import { gitService, fsService, shellService } from '@services'
import { FOLDER_SVG, iconFor, iconCategory } from './file-icons'
import type { Entry, GitKind } from './explorer.types'

// ---- Root resolution -------------------------------------------------------

// Find the git worktree whose path contains `cwd` (the active terminal lives
// inside it), so the explorer follows the worktree — not the configured/main
// root. Returns the longest (deepest) matching worktree path. todo17.
function worktreeRootFor(cwd: string): string | null {
  const c = cwd.replace(/\/+$/, '')
  let best: string | null = null
  const walk = (nodes: SidebarNode[]): void => {
    for (const n of nodes) {
      if (n.kind === 'worktree') {
        const w = n.worktreePath.replace(/\/+$/, '')
        if ((c === w || c.startsWith(w + '/')) && (!best || w.length > best.length)) best = w
      }
      if (n.kind === 'folder' || n.kind === 'project' || n.kind === 'worktree') walk(n.children)
    }
  }
  walk(state.tree)
  return best
}

// Root: follow the active terminal's worktree when it's in one (todo17), else
// the Settings value, else the active terminal's cwd.
export function explorerRoot(): string {
  const id = state.activePaneId
  const cwd = (id ? panes.get(id)?.cwd : null) ?? ''
  if (cwd) {
    const wt = worktreeRootFor(cwd)
    if (wt) return wt
  }
  const r = settings.explorerRoot.trim()
  if (r) return r
  return cwd
}

function isExcluded(name: string): boolean {
  return settings.explorerExclude.includes(name)
}

export function shortPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}

// markdown → in-app markdown viewer; everything else → the editable CodeMirror
// code editor pane (syntax highlight by extension + Cmd+S save).
export function openFile(path: string): void {
  if (/\.(md|mdx|mdc)$/i.test(path)) openMarkdownFile(path)
  else openCodeEditor(path)
}

// ---- Tree state ------------------------------------------------------------

let treeview: TreeView<Entry> | null = null
const childrenCache = new Map<string, Entry[]>()
const expanded = new Set<string>()
let gitStatus: Record<string, GitKind> = {}
let currentRoot = ''

async function loadDir(path: string): Promise<Entry[]> {
  const { entries } = await fsService.listEntries(path)
  const visible = entries.filter((e) => !isExcluded(e.name))
  childrenCache.set(path, visible)
  return visible
}

async function toggleDir(e: Entry): Promise<void> {
  if (expanded.has(e.path)) {
    expanded.delete(e.path)
  } else {
    expanded.add(e.path)
    if (!childrenCache.has(e.path)) await loadDir(e.path)
  }
  rerenderTree()
}

export function rerenderTree(): void {
  treeview?.render(childrenCache.get(currentRoot) ?? [])
}

// Git decoration class for a row. Files use their direct status; a directory is
// tinted (modified) when any changed path lives under it.
function gitClassFor(e: Entry): string {
  if (e.isDir) {
    const prefix = e.path + '/'
    for (const p in gitStatus) {
      if (p.startsWith(prefix)) return 'explorer-git-modified'
    }
    return ''
  }
  const kind = gitStatus[e.path]
  return kind ? 'explorer-git-' + kind : ''
}

// Parent directory of a path (no trailing slash). Falls back to "/".
function parentDir(p: string): string {
  return p.replace(/\/[^/]+\/?$/, '') || '/'
}

// Re-read the affected directory + git status, then re-render the tree.
async function refreshAfterChange(dir: string): Promise<void> {
  gitStatus = (await gitService.fileStatus(currentRoot)) as Record<string, GitKind>
  if (childrenCache.has(dir) || dir === currentRoot) await loadDir(dir)
  rerenderTree()
}

async function showError(message: string): Promise<void> {
  await promptConfirm({ title: 'Operation failed', message, confirmText: 'OK' })
}

async function newFile(dir: string): Promise<void> {
  const name = await promptText({
    title: 'New File',
    label: 'File name',
    placeholder: 'example.ts',
    confirmText: 'Create'
  })
  if (!name || !name.trim()) return
  const path = dir.replace(/\/$/, '') + '/' + name.trim()
  if (!(await fsService.createFile(path))) return void showError(`Could not create “${name.trim()}”.`)
  expanded.add(dir)
  await refreshAfterChange(dir)
  openFile(path)
}

async function newFolder(dir: string): Promise<void> {
  const name = await promptText({
    title: 'New Folder',
    label: 'Folder name',
    placeholder: 'components',
    confirmText: 'Create'
  })
  if (!name || !name.trim()) return
  const path = dir.replace(/\/$/, '') + '/' + name.trim()
  if (!(await fsService.mkdir(path))) return void showError(`Could not create “${name.trim()}”.`)
  expanded.add(dir)
  await refreshAfterChange(dir)
}

async function renameEntry(e: Entry): Promise<void> {
  const name = await promptText({ title: 'Rename', label: 'New name', value: e.name, confirmText: 'Rename' })
  if (!name || !name.trim() || name.trim() === e.name) return
  const dir = parentDir(e.path)
  const to = dir + '/' + name.trim()
  if (!(await fsService.renamePath(e.path, to))) return void showError(`Could not rename to “${name.trim()}”.`)
  expanded.delete(e.path)
  childrenCache.delete(e.path)
  await refreshAfterChange(dir)
}

async function deleteEntry(e: Entry): Promise<void> {
  const ok = await promptConfirm({
    title: 'Move to Trash',
    message: `“${e.name}” will be moved to the Trash.`,
    confirmText: 'Delete'
  })
  if (!ok) return
  if (!(await fsService.trashPath(e.path))) return void showError(`Could not delete “${e.name}”.`)
  expanded.delete(e.path)
  childrenCache.delete(e.path)
  await refreshAfterChange(parentDir(e.path))
}

// Context-menu items for a row. `rerender` is the view's full re-render, used by
// the "Exclude" action which drops the name and rebuilds from scratch.
function buildMenu(e: Entry, rerender: () => void): TreeMenuItem[] {
  const items: TreeMenuItem[] = []
  if (e.isDir) {
    items.push({ label: 'New File…', run: () => void newFile(e.path) })
    items.push({ label: 'New Folder…', run: () => void newFolder(e.path) })
  } else {
    items.push({ label: 'Open in new page', run: () => openCodeEditor(e.path, { newPage: true }) })
  }
  items.push({ label: 'Open in Finder', run: () => shellService.revealPath(e.path) })
  items.push({ label: 'Rename…', run: () => void renameEntry(e) })
  items.push({
    label: `Exclude “${e.name}”`,
    run: () => {
      if (!settings.explorerExclude.includes(e.name)) settings.explorerExclude.push(e.name)
      persistence.save()
      childrenCache.clear()
      rerender()
    }
  })
  items.push({ label: 'Delete', run: () => void deleteEntry(e), danger: true })
  return items
}

// Builds the tree adapter, threading the view's `rerender` to the row menu.
export function makeAdapter(rerender: () => void): TreeAdapter<Entry> {
  return {
    id: (e) => e.path,
    label: (e) => e.name,
    icon: (e) => (e.isDir ? FOLDER_SVG : iconFor(e.name)),
    iconClass: (e) => 'explorer-ic explorer-ic-' + (e.isDir ? 'folder' : iconCategory(e.name)),
    rowClass: (e) => gitClassFor(e),
    isContainer: (e) => e.isDir,
    children: (e) => childrenCache.get(e.path) ?? [],
    collapsed: (e) => !expanded.has(e.path),
    draggable: () => false,
    onToggle: (e) => void toggleDir(e),
    onActivate: (e) => {
      if (!e.isDir) openFile(e.path)
    },
    menu: (e) => buildMenu(e, rerender)
  }
}

// Creates the tree view on first render (idempotent).
export function ensureTreeview(el: HTMLElement, adapter: TreeAdapter<Entry>): void {
  if (!treeview) treeview = createTreeView<Entry>(el, adapter)
}

// Root changed → drop stale expansion/cache so we don't show another repo.
export function setCurrentRoot(root: string): void {
  if (root !== currentRoot) {
    currentRoot = root
    childrenCache.clear()
    expanded.clear()
  }
}

// Refresh git decorations + the root listing (loaded once, cached).
export async function loadRootStatus(root: string): Promise<void> {
  gitStatus = (await gitService.fileStatus(root)) as Record<string, GitKind>
  if (!childrenCache.has(root)) await loadDir(root)
}

// Flat search: contains-match on file name across the whole root (capped at 500).
export async function searchMatches(root: string, query: string): Promise<Array<{ name: string; path: string }>> {
  const q = query.toLowerCase()
  const res = await fsService.findFiles(root, settings.explorerExclude)
  return res.files.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 500)
}

// ---- View-bound event handlers ---------------------------------------------

export function makeSearchRowClick(path: string): () => void {
  return () => openFile(path)
}

export function makeRefreshClick(rerender: () => void): () => void {
  return () => {
    childrenCache.clear()
    rerender()
  }
}

// Debounced search: every keystroke schedules a re-render; cancel pending.
export function makeSearchInputHandler(rerender: () => void): () => void {
  let timer: number | null = null
  return () => {
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => rerender(), 200)
  }
}

export function stopPropagation(e: Event): void {
  e.stopPropagation()
}
