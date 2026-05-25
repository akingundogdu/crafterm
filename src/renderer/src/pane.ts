import { Terminal, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Pane, PaneStatus, BrowserPane, DocPane } from './types'
import { renderMarkdown } from './markdown'
import {
  panes,
  browsers,
  docs,
  opened,
  settings,
  resolveTheme,
  requestStatuses,
  requestSidebar,
  saveSoon,
  paneActions,
  state,
  uid,
  recordCommand,
  pushNotification
} from './state'
import { findTabByPane, ancestorFolders } from './tree'

type DropZoneName = 'left' | 'right' | 'top' | 'bottom'

// Which edge-zone of rect `r` the point (x,y) is nearest to.
function dropZoneAt(x: number, y: number, r: DOMRect): DropZoneName {
  const fx = (x - r.left) / r.width
  const fy = (y - r.top) / r.height
  const d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy }
  return (Object.keys(d) as DropZoneName[]).reduce((a, b) => (d[b] < d[a] ? b : a))
}

// The visible terminal pane-box under the cursor (skips pop-out placeholders,
// which carry no data-pane-id).
function paneBoxAt(x: number, y: number): HTMLElement | null {
  const boxes = document.querySelectorAll<HTMLElement>('#content .pane-box[data-pane-id]')
  for (const el of boxes) {
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el
  }
  return null
}

function clearDropZones(): void {
  document.querySelectorAll<HTMLElement>('.pane-drop').forEach((o) => (o.dataset.zone = ''))
}

// True if a submitted command launches Claude — the first program word of any
// &&/;/|-separated segment contains "claude" (covers `claude`, `claude --x`,
// `claude-movve`, `code-foo && claude`, `run-…-claude`), but not `echo claude`.
function commandRunsClaude(cmd: string): boolean {
  return cmd.split(/&&|\|\||;|\|/).some((seg) => /claude/i.test(seg.trim().split(/\s+/)[0] || ''))
}

// Drag-to-rearrange: the header is the handle. Uses pointer events (NOT HTML5
// drag-and-drop, which is unreliable over xterm canvases) and hit-tests the
// pane-box under the cursor each move; dropping re-lays-out the active tab.
function setupPaneDnd(box: HTMLElement, header: HTMLElement, id: string): void {
  const grip = document.createElement('span')
  grip.className = 'pane-grip'
  grip.textContent = '⠿'
  grip.title = 'Drag to move this pane'
  const title = header.querySelector('.pane-title')
  if (title) title.insertAdjacentElement('afterend', grip)
  else header.prepend(grip)

  // visual-only drop indicator (its ::after draws the highlighted zone)
  const overlay = document.createElement('div')
  overlay.className = 'pane-drop'
  box.appendChild(overlay)

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    // leave the header controls (⋯, ×) and inline rename alone
    if ((e.target as HTMLElement).closest('.pane-btn, .pane-close, .pane-rename')) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = (ev: MouseEvent): void => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 5) return
        dragging = true
        document.body.classList.add('dragging-pane')
      }
      clearDropZones()
      const targetBox = paneBoxAt(ev.clientX, ev.clientY)
      if (targetBox && targetBox.dataset.paneId !== id) {
        const drop = targetBox.querySelector<HTMLElement>('.pane-drop')
        if (drop) drop.dataset.zone = dropZoneAt(ev.clientX, ev.clientY, targetBox.getBoundingClientRect())
      }
    }
    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('mouseup', onUp, true)
      if (dragging) {
        const targetBox = paneBoxAt(ev.clientX, ev.clientY)
        const targetId = targetBox?.dataset.paneId
        if (targetId && targetId !== id) {
          paneActions.movePane(id, targetId, dropZoneAt(ev.clientX, ev.clientY, targetBox!.getBoundingClientRect()))
        }
      }
      document.body.classList.remove('dragging-pane')
      clearDropZones()
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('mouseup', onUp, true)
  })
}

// Push the pane's current geometry to the PTY, but only when it actually changed.
// A tab switch detaches/reattaches the pane element, which re-fires the
// ResizeObserver at the same size; without this guard every switch would send a
// no-op resize → SIGWINCH → a full TUI repaint (and a scroll jump on reflow).
function pushResize(pane: Pane): void {
  const { cols, rows } = pane.term
  if (cols === pane.lastCols && rows === pane.lastRows) return
  pane.lastCols = cols
  pane.lastRows = rows
  window.crafterm.resize(pane.id, cols, rows)
}

export async function createPane(
  cwd?: string,
  opts?: { env?: Record<string, string>; shell?: string }
): Promise<string> {
  const id = await window.crafterm.createPty({ cwd, env: opts?.env, shell: opts?.shell })

  const term = new Terminal({
    fontFamily: settings.font.family,
    fontSize: settings.font.size,
    cursorBlink: true,
    allowProposedApi: true,
    theme: resolveTheme()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)

  const el = document.createElement('div')
  el.className = 'pane-box'
  el.dataset.paneId = id

  const header = document.createElement('div')
  header.className = 'pane-header'
  const htitle = document.createElement('span')
  htitle.className = 'pane-title'
  htitle.textContent = 'zsh'
  const menuBtn = document.createElement('button')
  menuBtn.className = 'pane-btn'
  menuBtn.textContent = '⋯'
  menuBtn.title = 'Pane options'
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    showPaneMenu(menuBtn, id)
  })
  const close = document.createElement('button')
  close.className = 'pane-close'
  close.textContent = '×'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  header.append(htitle, menuBtn, close)

  const host = document.createElement('div')
  host.className = 'pane-term'
  const statusEl = document.createElement('div')
  statusEl.className = 'pane-status'
  statusEl.style.display = 'none'
  el.append(header, host, statusEl)
  setupPaneDnd(el, header, id)

  const pane: Pane = {
    id,
    term,
    fit,
    el,
    host,
    statusEl,
    htitle,
    ro: null as unknown as ResizeObserver,
    busy: false,
    busySince: 0,
    attention: false,
    idleTimer: null,
    title: '',
    titleLocked: false,
    cwd: null,
    branch: null,
    worktree: null,
    plans: [],
    claude: false,
    claudeSessionId: null,
    bgColor: null,
    fontSize: null,
    trackProjectPath: null,
    trackFeatureId: null,
    lastActivity: Date.now(),
    lastNotify: 0,
    lastCols: 0,
    lastRows: 0
  }

  // Shift+Enter and Option(Alt)+Enter should insert a newline in TUI line editors
  // (e.g. Claude's prompt) instead of submitting. A bare CR/LF is read as
  // "submit", so we wrap a CR in a bracketed-paste sequence (ESC[200~ … ESC[201~):
  // Ink-based TUIs like Claude treat pasted line breaks as newlines, not submits.
  // Scoped to Enter only, so other Option+key combos keep their special chars.
  term.attachCustomKeyEventHandler((e) => {
    if (
      e.type === 'keydown' &&
      e.key === 'Enter' &&
      (e.shiftKey || e.altKey) &&
      !e.metaKey &&
      !e.ctrlKey
    ) {
      e.preventDefault()
      window.crafterm.input(id, '\x1b[200~\r\x1b[201~')
      return false
    }
    return true
  })

  term.registerLinkProvider(makeLinkProvider(term))
  let cmdBuf = ''
  term.onData((data) => {
    window.crafterm.input(id, data)
    pane.lastActivity = Date.now() // keystrokes count as activity (idle detection)
    if (data.startsWith('\x1b')) return // skip arrow/nav/escape sequences
    for (const ch of data) {
      if (ch === '\r' || ch === '\n') {
        recordCommand(cmdBuf)
        // A command that launches claude (typed `claude…`, or an alias/segment
        // whose program name contains "claude") marks this as a Claude pane so it
        // resumes on restore. The exact session id is captured in refreshPaneInfo.
        if (commandRunsClaude(cmdBuf) && !pane.claude) {
          pane.claude = true
          saveSoon() // persist the claude flag promptly (don't wait for the next capture)
        }
        cmdBuf = ''
        // Arm the "finished" notification from the moment a command is submitted,
        // so even silent long runs (sleep, quiet test suites, Claude turns) ping.
        pane.busySince = Date.now()
      } else if (ch === '\x7f' || ch === '\b') cmdBuf = cmdBuf.slice(0, -1)
      else if (ch === '\x03' || ch === '\x15') cmdBuf = '' // Ctrl-C / Ctrl-U
      else if (ch >= ' ') cmdBuf += ch
    }
  })
  term.onBell(() => onBell(pane))
  term.onTitleChange((t) => onPaneTitle(pane, t))
  el.addEventListener('mousedown', () => paneActions.select(id))
  header.addEventListener('dblclick', () => startPaneRename(pane))

  const ro = new ResizeObserver(() => {
    if (!host.isConnected || host.clientWidth === 0) return
    try {
      fit.fit()
      pushResize(pane)
    } catch {
      /* ignore */
    }
  })
  ro.observe(host)
  pane.ro = ro

  panes.set(id, pane)
  applyPaneTheme(pane)
  void refreshPaneInfo(pane)
  return id
}

// Pane ⋯ menu backgrounds: the folder hues, but deeply darkened so they read as
// subtle terminal backgrounds rather than bright fills.
export const PANE_BG_PALETTE = [
  '#2a0f0d', // red
  '#27150a', // orange
  '#251b09', // amber
  '#0e2113', // green
  '#0d1a33', // blue
  '#1d1533', // purple
  '#291526', // pink
  '#181a1e' // gray
]

function paneBg(p: Pane): string {
  return p.bgColor ?? settings.bgColor
}

function applyPaneTheme(p: Pane): void {
  p.term.options.theme = { ...resolveTheme(), background: paneBg(p) }
  p.el.style.backgroundColor = paneBg(p)
}

// Set a pane's own background (null = fall back to the global default).
export function setPaneBackground(paneId: string, color: string | null): void {
  const p = panes.get(paneId)
  if (!p) return
  p.bgColor = color
  applyPaneTheme(p)
  saveSoon()
}

// Detects http(s) URLs in a terminal line and routes clicks to paneActions.
function makeLinkProvider(term: Terminal): { provideLinks: (y: number, cb: (links: ILink[] | undefined) => void) => void } {
  return {
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1)
      if (!line) return callback(undefined)
      const text = line.translateToString(true)
      // http(s) URLs, plus local file paths whose extension we handle
      // (markdown + the user's configurable code extensions).
      const exts = ['mdx', 'mdc', 'md', ...settings.codeExtensions]
        .filter((e) => /^[a-z0-9]+$/i.test(e))
        .sort((a, b) => b.length - a.length)
        .join('|')
      const re = new RegExp(
        `https?://[^\\s"'<>()\\[\\]]+|[^\\s"'<>()\\[\\]]+\\.(?:${exts})(?![A-Za-z0-9])`,
        'gi'
      )
      const links: ILink[] = []
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const url = m[0].replace(/[.,;:]+$/, '') // drop trailing sentence punctuation
        links.push({
          text: url,
          range: { start: { x: m.index + 1, y }, end: { x: m.index + url.length, y } },
          // Only follow links on Cmd+click, so a plain click never opens them.
          activate: (e, t) => {
            if (!e.metaKey) return
            paneActions.openLink(t)
          }
        })
      }
      callback(links.length ? links : undefined)
    }
  }
}

// Per-pane options menu (anchored under the ⋯ button). More entries to come.
function showPaneMenu(
  anchor: HTMLElement,
  paneId: string,
  opts: { worktree?: boolean; bg?: boolean } = {}
): void {
  document.querySelector('.context-menu')?.remove()
  const menu = document.createElement('div')
  menu.className = 'context-menu'
  const r = anchor.getBoundingClientRect()
  menu.style.left = Math.min(r.left, window.innerWidth - 220) + 'px'
  menu.style.top = r.bottom + 4 + 'px'

  const add = (label: string, fn: () => void): void => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', () => {
      menu.remove()
      fn()
    })
    menu.appendChild(b)
  }
  add('Split right', () => paneActions.split(paneId, 'row'))
  add('Split down', () => paneActions.split(paneId, 'col'))
  add('Split with project…', () => paneActions.splitWithProject(paneId))
  add('Open in Finder', () => {
    const cwd = panes.get(paneId)?.cwd
    if (cwd) window.crafterm.openPath(cwd)
  })
  add('Open URL in browser…', () => paneActions.openUrl())
  add('Track time…', () => paneActions.trackTime(paneId))
  if (opts.worktree !== false) add('Create worktree…', () => paneActions.createWorktree(paneId))

  // Git quick-actions (terminal panes in a repo). Each runs in a fresh split.
  if (opts.worktree !== false) {
    const gitLabel = document.createElement('div')
    gitLabel.className = 'menu-label'
    gitLabel.textContent = 'Git'
    menu.appendChild(gitLabel)
    add('Pull', () => paneActions.git(paneId, 'pull'))
    add('Commit + push…', () => paneActions.git(paneId, 'commitPush'))
    add('Commit + push + PR…', () => paneActions.git(paneId, 'commitPushPr'))
    add('New branch + PR…', () => paneActions.git(paneId, 'branchPr'))
    add('Stash changes…', () => paneActions.git(paneId, 'stash'))
    add('Stashes…', () => paneActions.stashes(paneId))
  }
  // pop-out is for plain terminal panes only (same gate as the bg swatches)
  if (opts.bg !== false) add('Pop out to window', () => paneActions.popOut(paneId))

  // per-pane background color (terminals only)
  if (opts.bg !== false) {
    const label = document.createElement('div')
    label.className = 'menu-label'
    label.textContent = 'Background'
    menu.appendChild(label)

    const colors = document.createElement('div')
    colors.className = 'color-swatches'
    const def = document.createElement('button')
    def.className = 'swatch none'
    def.title = 'Default'
    def.addEventListener('click', () => {
      menu.remove()
      setPaneBackground(paneId, null)
    })
    colors.appendChild(def)
    PANE_BG_PALETTE.forEach((c) => {
      const s = document.createElement('button')
      s.className = 'swatch'
      s.style.background = c
      s.addEventListener('click', () => {
        menu.remove()
        setPaneBackground(paneId, c)
      })
      colors.appendChild(s)
    })
    menu.appendChild(colors)
  }

  document.body.appendChild(menu)
  const onDown = (ev: MouseEvent): void => {
    if (!menu.contains(ev.target as Node)) {
      menu.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}

// An embedded browser pane that loads `url` in a <webview>.
export function createBrowserPane(url: string): string {
  const id = uid('b')

  const el = document.createElement('div')
  el.className = 'pane-box browser-pane'
  el.dataset.paneId = id

  const header = document.createElement('div')
  header.className = 'pane-header'
  const htitle = document.createElement('span')
  htitle.className = 'pane-title'
  htitle.textContent = url

  const reload = document.createElement('button')
  reload.className = 'pane-btn'
  reload.textContent = '⟳'
  reload.title = 'Reload'
  const ext = document.createElement('button')
  ext.className = 'pane-btn'
  ext.textContent = '↗'
  ext.title = 'Open in external browser'
  const menuBtn = document.createElement('button')
  menuBtn.className = 'pane-btn'
  menuBtn.textContent = '⋯'
  menuBtn.title = 'Pane options'
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    showPaneMenu(menuBtn, id, { worktree: false, bg: false })
  })
  const close = document.createElement('button')
  close.className = 'pane-close'
  close.textContent = '×'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  header.append(htitle, reload, ext, menuBtn, close)

  const webview = document.createElement('webview')
  webview.className = 'pane-web'
  webview.setAttribute('src', url)
  webview.setAttribute('allowpopups', 'true')

  el.append(header, webview)
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  const bp: BrowserPane = { id, el, webview, url }
  reload.addEventListener('click', (e) => {
    e.stopPropagation()
    ;(webview as unknown as { reload?: () => void }).reload?.()
  })
  ext.addEventListener('click', (e) => {
    e.stopPropagation()
    window.crafterm.openExternal(bp.url)
  })
  webview.addEventListener('page-title-updated', (e) => {
    const t = (e as unknown as { title?: string }).title
    if (t) htitle.textContent = t
  })

  browsers.set(id, bp)
  return id
}

export function destroyBrowserPane(id: string): void {
  browsers.delete(id)
}

// A markdown note pane: rendered preview + raw editor + save. With
// { absolute:true } it reads any file on disk read-only (no editing).
export function createDocPane(source: string, opts?: { absolute?: boolean }): string {
  const absolute = !!opts?.absolute
  const id = uid('m')
  const el = document.createElement('div')
  el.className = 'pane-box doc-pane'
  el.dataset.paneId = id

  const header = document.createElement('div')
  header.className = 'pane-header'
  const htitle = document.createElement('span')
  htitle.className = 'pane-title'
  htitle.textContent = source.split('/').pop() || source

  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'pane-btn'
  refreshBtn.textContent = '⟳'
  refreshBtn.title = 'Reload from disk'
  const editBtn = document.createElement('button')
  editBtn.className = 'pane-btn'
  editBtn.textContent = 'Edit'
  editBtn.title = 'Edit / Preview'
  const close = document.createElement('button')
  close.className = 'pane-close'
  close.textContent = '×'
  close.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.close(id)
  })
  header.append(htitle, refreshBtn, editBtn, close)

  const preview = document.createElement('div')
  preview.className = 'doc-preview'
  const editor = document.createElement('textarea')
  editor.className = 'doc-editor'
  editor.spellcheck = false
  editor.style.display = 'none'

  el.append(header, preview, editor)
  setupPaneDnd(el, header, id)
  el.addEventListener('mousedown', () => paneActions.select(id))

  let editing = false
  let raw = ''
  // Re-read the file from disk and re-render (skips re-render while editing so
  // unsaved edits aren't clobbered). Used for initial load and the ⟳ button.
  const reload = async (): Promise<void> => {
    const content = await (absolute ? window.crafterm.readMd(source) : window.crafterm.nbRead(source))
    raw = content
    if (!editing) {
      editor.value = content
      preview.innerHTML = renderMarkdown(content)
    }
  }
  void reload()
  // External files (opened from the terminal) write back through fs:writeMd;
  // notebook files go through the notebook store.
  const saveDoc = (text: string): void => {
    if (absolute) void window.crafterm.writeMd(source, text)
    else window.crafterm.nbWrite(source, text)
  }
  refreshBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void reload()
  })
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (editing) {
      // leaving edit mode -> save + re-render
      raw = editor.value
      saveDoc(raw)
      preview.innerHTML = renderMarkdown(raw)
    }
    editing = !editing
    editBtn.textContent = editing ? 'Preview' : 'Edit'
    preview.style.display = editing ? 'none' : 'block'
    editor.style.display = editing ? 'block' : 'none'
    if (editing) editor.focus()
  })
  // Cmd+S saves while editing
  editor.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.metaKey && e.key.toLowerCase() === 's') {
      e.preventDefault()
      raw = editor.value
      saveDoc(raw)
    }
  })

  docs.set(id, { id, el, relPath: source })
  return id
}

export function destroyDocPane(id: string): void {
  docs.delete(id)
}

export function mountPanes(): void {
  for (const pane of panes.values()) {
    if (!opened.has(pane.id) && pane.host.isConnected) {
      pane.term.open(pane.host)
      opened.add(pane.id)
      requestAnimationFrame(() => {
        try {
          pane.fit.fit()
          pushResize(pane)
        } catch {
          /* ignore */
        }
      })
    }
  }
}

export function destroyPane(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  if (pane.idleTimer) clearTimeout(pane.idleTimer)
  pane.ro.disconnect()
  pane.term.dispose()
  panes.delete(paneId)
  opened.delete(paneId)
}

// A run shorter than this is an echo or a trivial command — not worth pinging about.
const LONG_RUN_MS = 3000

export function markBusy(pane: Pane): void {
  pane.busy = true
  pane.lastActivity = Date.now() // terminal output counts as activity (idle detection)
  if (pane.idleTimer) clearTimeout(pane.idleTimer)
  pane.idleTimer = window.setTimeout(() => {
    pane.busy = false
    // The armed command (busySince set on Enter) went quiet for 700ms. If it ran
    // long enough, ping when the user is looking elsewhere, then disarm so we ping
    // once per command. While still under the threshold we keep waiting (a quiet
    // gap inside the command, e.g. `sleep`, must not disarm it).
    if (pane.busySince > 0 && Date.now() - pane.busySince >= LONG_RUN_MS) {
      if (notifyPane(pane, `${pane.title || 'zsh'} finished`, 'done')) pane.attention = true
      pane.busySince = 0
    }
    requestStatuses()
  }, 700)
  requestStatuses()
}

export function paneStatus(p: Pane): PaneStatus {
  return p.attention ? 'attention' : p.busy ? 'running' : 'idle'
}

// Native notification for a pane, but only when it's unattended (window blurred
// or a different pane active) and we haven't just pinged. `event` picks the
// sound: 'question' when the pane wants attention (bell), 'done' when a command
// finishes. Returns whether it fired.
function notifyPane(pane: Pane, body: string, event: 'question' | 'done'): boolean {
  const now = Date.now()
  const unattended = !document.hasFocus() || state.activePaneId !== pane.id
  if (!unattended || now - pane.lastNotify < 2000) return false
  pane.lastNotify = now
  window.crafterm.notify('Crafterm', body, pane.id) // paneId lets a click focus this pane
  window.crafterm.playEventSound(event)
  // Also drop a card in the right notification panel, tagged with its folder path
  // and the same git/cwd detail the sidebar shows when the terminal is pinned.
  const tab = findTabByPane(state.tree, pane.id)
  const trail = tab ? ancestorFolders(state.tree, tab.id) : null
  const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
  pushNotification(pane.id, pane.title || 'zsh', group, body, {
    kind: 'pane',
    event,
    branch: pane.branch,
    worktree: pane.worktree,
    cwd: pane.cwd
  })
  return true
}

function onBell(pane: Pane): void {
  pane.attention = true
  notifyPane(pane, `${pane.title || 'zsh'} is ready`, 'question')
  requestStatuses()
}

function onPaneTitle(pane: Pane, raw: string): void {
  const clean = raw.trim()
  if (!pane.titleLocked && clean) {
    pane.title = clean
    pane.htitle.textContent = clean
  }
  const tab = findTabByPane(state.tree, pane.id)
  if (tab && !tab.titleLocked) {
    // a single-pane tab mirrors its pane's title
    const firstPaneTitle = panes.get(firstPaneId(tab.root))?.title
    if (firstPaneTitle) tab.title = firstPaneTitle
  }
  requestSidebar()
  saveSoon()
}

function firstPaneId(node: import('./types').LayoutNode): string {
  return node.type === 'leaf' ? node.paneId : firstPaneId(node.children[0])
}

export async function refreshPaneInfo(pane: Pane): Promise<void> {
  const info = await window.crafterm.paneInfo(pane.id)
  const cwdChanged = info.cwd !== pane.cwd
  const branchChanged = info.branch !== pane.branch
  pane.cwd = info.cwd
  pane.branch = info.branch
  pane.worktree = info.worktree
  updatePaneStatus(pane)
  // Plan files for this branch (docs/plans/<branch>-*.md), shown under the node.
  if (cwdChanged || branchChanged) {
    const plans =
      pane.cwd && pane.branch ? await window.crafterm.plansForBranch(pane.cwd, pane.branch) : []
    const sig = (a: { path: string }[]): string => a.map((x) => x.path).join('|')
    if (sig(plans) !== sig(pane.plans)) {
      pane.plans = plans
      requestSidebar()
    }
  }
  // For Claude panes, track the latest session id for this cwd so restore can
  // `claude --resume <id>` the exact conversation that was open here.
  if (pane.claude && pane.cwd) {
    const sid = await window.crafterm.claudeLatestSession(pane.cwd)
    if (sid && sid !== pane.claudeSessionId) {
      pane.claudeSessionId = sid
      saveSoon()
    }
  }
  requestStatuses()
  if (cwdChanged) saveSoon() // persist the latest cwd so restore reopens here
}

// Keep only the last `n` path segments, prefixed with an ellipsis when trimmed.
function lastPathSegments(p: string, n: number): string {
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length <= n) return p
  return '…/' + parts.slice(-n).join('/')
}

const COPY_ICON =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">' +
  '<rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '<path d="M3.4 10.4H3a1.5 1.5 0 0 1-1.5-1.5V3a1.5 1.5 0 0 1 1.5-1.5h5.9A1.5 1.5 0 0 1 10.4 3v.4" fill="none" stroke="currentColor" stroke-width="1.3"/>' +
  '</svg>'

// Per-pane bottom status bar: tracking · branch · worktree/repo · cwd (last 4
// segments) plus a button that copies the full path. Hidden when there's nothing.
export function updatePaneStatus(pane: Pane): void {
  const fullCwd = pane.cwd
  const homeShort = fullCwd ? fullCwd.replace(/^\/(Users|home)\/[^/]+/, '~') : null
  const cwd = homeShort ? lastPathSegments(homeShort, 4) : null
  const segs: { cls: string; text: string }[] = []
  if (pane.trackProjectPath) {
    const proj = settings.projects.find((p) => p.path === pane.trackProjectPath)
    const feat = pane.trackFeatureId
      ? settings.features.find((f) => f.id === pane.trackFeatureId)
      : null
    segs.push({ cls: 'tracking', text: feat?.name ?? proj?.name ?? 'tracking' })
  }
  if (pane.branch) segs.push({ cls: 'branch', text: pane.branch })
  if (pane.worktree) segs.push({ cls: 'worktree', text: pane.worktree })
  if (cwd) segs.push({ cls: 'cwd', text: cwd })
  if (!segs.length) {
    pane.statusEl.style.display = 'none'
    return
  }
  pane.statusEl.replaceChildren()
  segs.forEach((s, i) => {
    if (i > 0) {
      const sep = document.createElement('span')
      sep.className = 'pane-status-sep'
      sep.textContent = '·'
      pane.statusEl.appendChild(sep)
    }
    const seg = document.createElement('span')
    seg.className = 'pane-status-seg ' + s.cls
    seg.textContent = s.text
    // Clicking the branch opens a searchable checkout picker.
    if (s.cls === 'branch') {
      seg.classList.add('clickable')
      seg.title = 'Checkout branch…'
      seg.addEventListener('click', (e) => {
        e.stopPropagation()
        paneActions.branchCheckout(pane.id)
      })
    }
    pane.statusEl.appendChild(seg)
  })
  if (fullCwd) {
    const copyBtn = document.createElement('button')
    copyBtn.className = 'pane-status-copy'
    copyBtn.title = 'Copy full path'
    copyBtn.setAttribute('aria-label', 'Copy full path')
    copyBtn.innerHTML = COPY_ICON
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      void navigator.clipboard.writeText(fullCwd)
      copyBtn.classList.add('copied')
      copyBtn.textContent = '✓'
      window.setTimeout(() => {
        copyBtn.classList.remove('copied')
        copyBtn.innerHTML = COPY_ICON
      }, 1100)
    })
    pane.statusEl.appendChild(copyBtn)
  }
  pane.statusEl.style.display = 'flex'
}

export function startPaneRename(pane: Pane): void {
  const header = pane.el.querySelector('.pane-header')
  if (!header) return
  const input = document.createElement('input')
  input.className = 'pane-rename'
  input.value = pane.title
  header.replaceChild(input, pane.htitle)
  input.focus()
  input.select()
  const done = (commit: boolean): void => {
    if (commit) {
      const v = input.value.trim()
      if (v) {
        pane.title = v
        pane.titleLocked = true
        pane.htitle.textContent = v
      }
    }
    if (input.parentElement === header) header.replaceChild(pane.htitle, input)
    saveSoon()
    requestSidebar()
  }
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') done(true)
    else if (e.key === 'Escape') done(false)
  })
  input.addEventListener('blur', () => done(true))
}

export function applyAppearance(): void {
  panes.forEach((p) => {
    applyPaneTheme(p) // keeps each pane's own background override
    p.term.options.fontFamily = settings.font.family
    p.term.options.fontSize = p.fontSize ?? settings.font.size // keep per-pane size
    try {
      p.fit.fit()
      pushResize(p)
    } catch {
      /* ignore */
    }
  })
}

// Apply one pane's effective font size (its override, else the global default).
function applyPaneFont(p: Pane): void {
  p.term.options.fontSize = p.fontSize ?? settings.font.size
  try {
    p.fit.fit()
    pushResize(p)
  } catch {
    /* ignore */
  }
}

// Cmd +/- with a terminal focused: zoom only the active pane, not every pane.
export function adjustActivePaneFontSize(delta: number): void {
  const p = state.activePaneId ? panes.get(state.activePaneId) : null
  if (!p) return
  const cur = p.fontSize ?? settings.font.size
  p.fontSize = Math.max(6, Math.min(40, cur + delta))
  applyPaneFont(p)
}

// Cmd+0: drop the active pane's override so it follows the global font size again.
export function resetActivePaneFontSize(): void {
  const p = state.activePaneId ? panes.get(state.activePaneId) : null
  if (!p) return
  p.fontSize = null
  applyPaneFont(p)
}
