import { settings, state, panes, saveSoon } from './state'
import { openMarkdownFile, openFileViewer, splitWithIde } from './commands'
import type { SidebarNode } from './types'

function treeEl(): HTMLElement {
  return document.getElementById('explorer-tree')!
}
function rootEl(): HTMLElement {
  return document.getElementById('explorer-root')!
}
function searchEl(): HTMLInputElement {
  return document.getElementById('explorer-search') as HTMLInputElement
}

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

// markdown → in-app markdown viewer; everything else → a read-only, line-
// selectable file viewer pane (select lines and send a `path:line` reference to
// a terminal to ask Claude about that spot).
function openFile(path: string): void {
  if (/\.(md|mdx|mdc)$/i.test(path)) openMarkdownFile(path)
  else openFileViewer(path)
}

const CHEVRON = '▸'

function showFileContextMenu(e: MouseEvent, entry: Entry): void {
  document.querySelector('.context-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'context-menu'
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px'
  menu.style.top = e.clientY + 'px'

  if (!entry.isDir) {
    const editor = document.createElement('button')
    editor.textContent = 'Open in editor'
    editor.addEventListener('click', () => {
      menu.remove()
      void splitWithIde(entry.path)
    })
    menu.appendChild(editor)
  }

  const reveal = document.createElement('button')
  reveal.textContent = 'Open in Finder'
  reveal.addEventListener('click', () => {
    menu.remove()
    window.crafterm.revealPath(entry.path)
  })
  menu.appendChild(reveal)

  const exclude = document.createElement('button')
  exclude.textContent = `Exclude “${entry.name}”`
  exclude.addEventListener('click', () => {
    menu.remove()
    if (!settings.explorerExclude.includes(entry.name)) settings.explorerExclude.push(entry.name)
    saveSoon()
    void renderExplorer()
  })
  menu.appendChild(exclude)

  document.body.appendChild(menu)
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}

interface Entry {
  name: string
  path: string
  isDir: boolean
}

function buildRow(entry: Entry, depth: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'explorer-row' + (entry.isDir ? ' dir' : ' file')
  row.style.paddingLeft = 6 + depth * 12 + 'px'

  const tri = document.createElement('span')
  tri.className = 'explorer-tri'
  tri.textContent = entry.isDir ? CHEVRON : ''
  const name = document.createElement('span')
  name.className = 'explorer-name'
  name.textContent = entry.name
  row.append(tri, name)

  if (entry.isDir) {
    let open = false
    let childrenEl: HTMLElement | null = null
    row.addEventListener('click', async () => {
      open = !open
      tri.classList.toggle('open', open)
      if (open) {
        childrenEl = document.createElement('div')
        childrenEl.className = 'explorer-children'
        row.after(childrenEl)
        await renderInto(entry.path, childrenEl, depth + 1)
      } else {
        childrenEl?.remove()
        childrenEl = null
      }
    })
  } else {
    row.addEventListener('click', () => openFile(entry.path))
  }
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    showFileContextMenu(e, entry)
  })
  return row
}

async function renderInto(path: string, container: HTMLElement, depth: number): Promise<void> {
  const { entries } = await window.crafterm.listEntries(path)
  const visible = entries.filter((e) => !isExcluded(e.name))
  if (!visible.length) {
    container.insertAdjacentHTML('beforeend', `<div class="explorer-empty" style="padding-left:${6 + depth * 12}px">empty</div>`)
    return
  }
  for (const e of visible) container.appendChild(buildRow(e, depth))
}

// Flat "search results" view: contains-match on file/dir name across the root.
async function renderSearch(root: string, query: string): Promise<void> {
  const el = treeEl()
  el.replaceChildren()
  const q = query.toLowerCase()
  const res = await window.crafterm.findFiles(root, settings.explorerExclude)
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

export async function renderExplorer(): Promise<void> {
  const root = explorerRoot()
  rootEl().textContent = root ? shortPath(root) : ''
  rootEl().title = root
  const el = treeEl()
  el.replaceChildren()
  if (!root) {
    el.insertAdjacentHTML(
      'beforeend',
      '<div class="notif-empty">No root yet. Set one in Settings → Workspace, or open a terminal.</div>'
    )
    return
  }
  const q = (searchEl()?.value ?? '').trim()
  if (q) {
    await renderSearch(root, q)
    return
  }
  await renderInto(root, el, 0)
}

export function initExplorer(): void {
  document.getElementById('explorer-refresh')!.addEventListener('click', () => void renderExplorer())
  // Debounced search: every keystroke schedules a re-render; cancel pending.
  let timer: number | null = null
  searchEl()?.addEventListener('input', () => {
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => void renderExplorer(), 200)
  })
  searchEl()?.addEventListener('keydown', (e) => e.stopPropagation())
}
