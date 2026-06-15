import { settings, state, panes } from './state'
import { persistence } from './services/storage/persistence.service'
import { openMarkdownFile, openCodeEditor } from './commands'
import { createTreeView, type TreeAdapter, type TreeView, type TreeMenuItem } from '@crafterm/ui'
import { promptText, promptConfirm } from './dialog'
import type { SidebarNode } from './types'
import { gitService, fsService } from './services/ipc'

function treeEl(): HTMLElement {
  return document.getElementById('explorer-tree')!
}
function rootEl(): HTMLElement {
  return document.getElementById('explorer-root')!
}
function searchEl(): HTMLInputElement {
  return document.getElementById('explorer-search') as HTMLInputElement
}

// ---- Icons (inline SVG) ----------------------------------------------------

const FOLDER_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M1.6 4.4c0-.6.4-1 1-1h3.1l1.2 1.4H13.4c.6 0 1 .4 1 1V11.6c0 .6-.4 1-1 1H2.6c-.6 0-1-.4-1-1z" fill="currentColor"/></svg>'
const FILE_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>'

// A short letter/symbol badge glyph (e.g. "TS", "JS", "<>"), tinted via iconClass.
function letterGlyph(text: string, font = 'system-ui,-apple-system,sans-serif'): string {
  const size = text.length >= 2 ? 7 : 11
  return `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><text x="8" y="11.5" text-anchor="middle" font-family="${font}" font-weight="700" font-size="${size}" fill="currentColor">${text}</text></svg>`
}

// Config / settings glyph: three horizontal lines of varying length.
const LINES_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"><path d="M3 5h10M3 8h7M3 11h10"/></g></svg>'

// Markdown mark: rounded square with the "M" + downward arrow.
const MD_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="1" y="3.5" width="14" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3 10.5V5.5h1.4L6 7.6l1.6-2.1H9v5H7.6V7.7L6 9.7 4.4 7.7v2.8z" fill="currentColor"/><path d="M11.4 5.5h1.3v2.7h1.1l-1.75 2.1-1.75-2.1h1.1z" fill="currentColor"/></svg>'

// Image glyph: framed picture with a sun and a mountain.
const IMG_SVG =
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="5.5" cy="6.5" r="1.1" fill="currentColor"/><path d="M3 12l3.5-3.5L9 11l2-2 2 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>'

// Distinct glyph per icon category (falls back to the generic file outline).
const GLYPHS: Record<string, string> = {
  ts: letterGlyph('TS'),
  js: letterGlyph('JS'),
  json: letterGlyph('{}', 'ui-monospace,monospace'),
  md: MD_SVG,
  sh: letterGlyph('$', 'ui-monospace,monospace'),
  config: LINES_SVG,
  data: LINES_SVG,
  web: letterGlyph('<>'),
  img: IMG_SVG,
  swift: letterGlyph('SW'),
  py: letterGlyph('PY'),
  go: letterGlyph('GO'),
  rust: letterGlyph('RS')
}

// Map a filename to an icon category — drives both the glyph and the color tint.
function iconCategory(name: string): string {
  const lower = name.toLowerCase()
  // Special filenames (no or ambiguous extension).
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.') || lower === '.dockerignore') return 'config'
  if (lower === 'makefile' || lower === 'cmakelists.txt') return 'config'
  if (lower.startsWith('.env')) return 'config'
  if (
    lower === '.gitignore' ||
    lower === '.gitattributes' ||
    lower === '.npmrc' ||
    lower === '.editorconfig' ||
    lower === '.prettierrc'
  )
    return 'config'

  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  switch (ext) {
    case 'swift':
      return 'swift'
    case 'ts':
    case 'tsx':
      return 'ts'
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'js'
    case 'json':
    case 'jsonc':
      return 'json'
    case 'md':
    case 'mdx':
    case 'mdc':
    case 'markdown':
      return 'md'
    case 'html':
    case 'htm':
    case 'css':
    case 'scss':
    case 'less':
      return 'web'
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return 'sh'
    case 'ini':
    case 'conf':
    case 'cfg':
    case 'properties':
      return 'config'
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
    case 'plist':
      return 'data'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'webp':
    case 'icns':
      return 'img'
    case 'py':
      return 'py'
    case 'go':
      return 'go'
    case 'rs':
      return 'rust'
    default:
      return 'default'
  }
}

// The glyph for a file: a type-specific badge when known, else the file outline.
function iconFor(name: string): string {
  return GLYPHS[iconCategory(name)] ?? FILE_SVG
}

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
function explorerRoot(): string {
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

function shortPath(p: string): string {
  return p.replace(/^\/(Users|home)\/[^/]+/, '~')
}

// markdown → in-app markdown viewer; everything else → the editable CodeMirror
// code editor pane (syntax highlight by extension + Cmd+S save).
function openFile(path: string): void {
  if (/\.(md|mdx|mdc)$/i.test(path)) openMarkdownFile(path)
  else openCodeEditor(path)
}

interface Entry {
  name: string
  path: string
  isDir: boolean
}

type GitKind = 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'

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

function rerenderTree(): void {
  treeview?.render(childrenCache.get(currentRoot) ?? [])
}

// Git decoration class for a row. Files use their direct status; a directory is
// tinted (modified) when any changed path lives under it.
function gitClassFor(e: Entry): string {
  if (e.isDir) {
    const prefix = e.path + '/'
    for (const p in gitStatus) {
      if (p.startsWith(prefix)) return 'expl-git-modified'
    }
    return ''
  }
  const kind = gitStatus[e.path]
  return kind ? 'expl-git-' + kind : ''
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

function buildMenu(e: Entry): TreeMenuItem[] {
  const items: TreeMenuItem[] = []
  if (e.isDir) {
    items.push({ label: 'New File…', run: () => void newFile(e.path) })
    items.push({ label: 'New Folder…', run: () => void newFolder(e.path) })
  } else {
    items.push({ label: 'Open in new page', run: () => openCodeEditor(e.path, { newPage: true }) })
  }
  items.push({ label: 'Open in Finder', run: () => fsService.revealPath(e.path) })
  items.push({ label: 'Rename…', run: () => void renameEntry(e) })
  items.push({
    label: `Exclude “${e.name}”`,
    run: () => {
      if (!settings.explorerExclude.includes(e.name)) settings.explorerExclude.push(e.name)
      persistence.save()
      childrenCache.clear()
      void renderExplorer()
    }
  })
  items.push({ label: 'Delete', run: () => void deleteEntry(e), danger: true })
  return items
}

const adapter: TreeAdapter<Entry> = {
  id: (e) => e.path,
  label: (e) => e.name,
  icon: (e) => (e.isDir ? FOLDER_SVG : iconFor(e.name)),
  iconClass: (e) => 'expl-ic expl-ic-' + (e.isDir ? 'folder' : iconCategory(e.name)),
  rowClass: (e) => gitClassFor(e),
  isContainer: (e) => e.isDir,
  children: (e) => childrenCache.get(e.path) ?? [],
  collapsed: (e) => !expanded.has(e.path),
  draggable: () => false,
  onToggle: (e) => void toggleDir(e),
  onActivate: (e) => {
    if (!e.isDir) openFile(e.path)
  },
  menu: (e) => buildMenu(e)
}

// ---- Flat search view (contains-match on name across the whole root) --------

async function renderSearch(root: string, query: string): Promise<void> {
  const el = treeEl()
  el.replaceChildren()
  const q = query.toLowerCase()
  const res = await fsService.findFiles(root, settings.explorerExclude)
  const matches = res.files.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 500)
  if (!matches.length) {
    el.insertAdjacentHTML('beforeend', '<div class="explorer-empty" style="padding-left:6px">no matches</div>')
    return
  }
  for (const m of matches) {
    const row = document.createElement('div')
    row.className = 'explorer-row file'
    row.style.paddingLeft = '6px'
    const tri = document.createElement('span')
    tri.className = 'explorer-tri'
    const name = document.createElement('span')
    name.className = 'explorer-name'
    name.textContent = m.name
    const sub = document.createElement('span')
    sub.className = 'explorer-sub'
    sub.textContent = shortPath(m.path.replace(/\/[^/]+$/, ''))
    row.append(tri, name, sub)
    row.addEventListener('click', () => openFile(m.path))
    el.appendChild(row)
  }
}

// ---- Public render ---------------------------------------------------------

export async function renderExplorer(): Promise<void> {
  const root = explorerRoot()
  rootEl().textContent = root ? shortPath(root) : ''
  rootEl().title = root
  const el = treeEl()
  if (!root) {
    el.replaceChildren()
    el.insertAdjacentHTML(
      'beforeend',
      '<div class="notif-empty">No root yet. Set one in Settings → Workspace, or open a terminal.</div>'
    )
    return
  }
  // Root changed → drop stale expansion/cache so we don't show another repo.
  if (root !== currentRoot) {
    currentRoot = root
    childrenCache.clear()
    expanded.clear()
  }
  const q = (searchEl()?.value ?? '').trim()
  if (q) {
    await renderSearch(root, q)
    return
  }
  if (!treeview) treeview = createTreeView<Entry>(el, adapter)
  // Refresh git decorations + the root listing, then render.
  gitStatus = (await gitService.fileStatus(root)) as Record<string, GitKind>
  if (!childrenCache.has(root)) await loadDir(root)
  rerenderTree()
}

export function initExplorer(): void {
  document.getElementById('explorer-refresh')!.addEventListener('click', () => {
    childrenCache.clear()
    void renderExplorer()
  })
  // Debounced search: every keystroke schedules a re-render; cancel pending.
  let timer: number | null = null
  searchEl()?.addEventListener('input', () => {
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => void renderExplorer(), 200)
  })
  searchEl()?.addEventListener('keydown', (e) => e.stopPropagation())
}
