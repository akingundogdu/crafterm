import { Terminal, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type {
  Pane,
  PaneStatus,
  NodeStatus,
  BrowserPane,
  DocPane,
  ProjectCommand,
  ProjectNode,
  Application
} from './types'
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
import {
  findProjectByPath,
  findFeature,
  findProjectById,
  findApp,
  flattenProjects
} from './catalog'

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
export function setupPaneDnd(box: HTMLElement, header: HTMLElement, id: string): void {
  const grip = document.createElement('span')
  grip.className = 'pane-grip'
  grip.textContent = '⠿'
  grip.title = 'Drag to move this pane'
  // Sit the grip just after the daily-task chip (when present) so the issue key
  // shows to the LEFT of the drag handle; otherwise right after the title.
  const anchor = header.querySelector('.pane-daily-chip') ?? header.querySelector('.pane-title')
  if (anchor) anchor.insertAdjacentElement('afterend', grip)
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
  opts?: { env?: Record<string, string>; shell?: string; stableId?: string; attachId?: string }
): Promise<string> {
  const stableId = opts?.attachId || opts?.stableId || crypto.randomUUID()
  // Exposed to the shell as CRAFTERM_PANE_ID; the renderer-supplied value wins
  // over anything the caller might have placed in opts.env.
  const env = { ...(opts?.env ?? {}), CRAFTERM_PANE_ID: stableId }
  // Attach mode: this pane is a VIEW onto an already-running background process
  // (its PTY id === the process stableId). Skip spawning — the PTY already exists
  // in main; closing this view must not kill it.
  const id = opts?.attachId
    ? opts.attachId
    : await window.crafterm.createPty({ cwd, env, shell: opts?.shell })

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
  // Chip showing the assigned daily task (hidden until one is assigned). Clicking
  // it opens the assign/update modal.
  const taskChip = document.createElement('button')
  taskChip.className = 'pane-daily-chip'
  taskChip.style.display = 'none'
  taskChip.title = 'Daily ticket — click for details'
  taskChip.addEventListener('click', (e) => {
    e.stopPropagation()
    paneActions.viewTicketDetail(id)
  })
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
  header.append(htitle, taskChip, menuBtn, close)

  const host = document.createElement('div')
  host.className = 'pane-term'
  const statusEl = document.createElement('div')
  statusEl.className = 'pane-status'
  statusEl.style.display = 'none'
  el.append(header, host, statusEl)
  setupPaneDnd(el, header, id)

  const pane: Pane = {
    id,
    stableId,
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
    // Seed from the spawn cwd (absolute paths only) so the pane is never null
    // during the post-restore window — the first lsof tick corrects anything
    // stale, and the null-guard in refreshPaneInfo keeps a transient lsof
    // failure from wiping it back to null.
    cwd: cwd && cwd.startsWith('/') ? cwd : null,
    branch: null,
    worktree: null,
    lastCommand: null,
    plans: [],
    claude: false,
    claudeSessionId: null,
    claudeSpawnedAt: null,
    claudeSessionLocked: false,
    bgColor: null,
    fontSize: null,
    trackProjectPath: null,
    trackFeatureId: null,
    projectId: null,
    appId: null,
    dailyTaskId: null,
    status: 'idle',
    role: 'shell',
    isProcessView: !!opts?.attachId,
    lastActivity: Date.now(),
    lastNotify: 0,
    lastCols: 0,
    lastRows: 0,
    outputTail: ''
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
          // baseline so refreshPaneInfo only picks up the session this command
          // is about to create — not any pre-existing jsonl in the cwd
          pane.claudeSpawnedAt = Date.now()
          pane.claudeSessionLocked = false
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

// One row in the pane ⋯ menu. `item` is a clickable action, `label` a
// non-interactive section heading, `swatch` a background-color button.
// Sync the pane header's daily-task chip with pane.dailyTaskId. Called after an
// assignment changes (from dailyPlan.ts via paneActions).
export function refreshPaneDailyTask(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const chip = pane.el.querySelector<HTMLElement>('.pane-daily-chip')
  if (!chip) return
  // Only surface the chip when the terminal was opened from a ticket (the task
  // carries an issue key); plain assignments without a key stay hidden.
  const key = pane.dailyTaskId ? paneActions.dailyTaskIssueKey(pane.dailyTaskId) : null
  if (key) {
    chip.textContent = key
    chip.style.display = ''
  } else {
    chip.textContent = ''
    chip.style.display = 'none'
  }
}

// buildPaneMenu produces these so both the menu and the global search (Cmd+J)
// consume the same definition without duplicating the action logic.
export type PaneMenuEntry =
  | { kind: 'item'; label: string; run: () => void }
  | { kind: 'label'; text: string }
  | { kind: 'swatch'; label: string; color: string | null; run: () => void }

export function buildPaneMenu(
  paneId: string,
  opts: { worktree?: boolean; bg?: boolean } = {}
): PaneMenuEntry[] {
  const out: PaneMenuEntry[] = []
  const item = (label: string, run: () => void): void => {
    out.push({ kind: 'item', label, run })
  }
  const section = (text: string): void => {
    out.push({ kind: 'label', text })
  }

  item('Split right', () => paneActions.split(paneId, 'row'))
  item('Split down', () => paneActions.split(paneId, 'col'))
  item('Split with project…', () => paneActions.splitWithProject(paneId))
  // Plan-mode: a plan this pane produced has been auto-opened — offer Clarify,
  // which runs the clarify skill in this terminal.
  if (panes.get(paneId)?.planMode && panes.get(paneId)?.claude) {
    item('Clarify plan', () => paneActions.clarify(paneId))
  }
  // Daily task: when assigned, surface a dedicated section (view detail, mark
  // done, change); otherwise a single assign entry.
  {
    const assignedId = panes.get(paneId)?.dailyTaskId
    if (assignedId) {
      section('Daily task')
      item('View ticket detail', () => paneActions.viewTicketDetail(paneId))
      if (paneActions.dailyTaskStatus(assignedId) !== 'done') {
        item('Mark as done', () => paneActions.markTaskDone(paneId))
      }
      item('Change task…', () => paneActions.assignDailyTask(paneId))
    } else {
      item('Assign to daily task…', () => paneActions.assignDailyTask(paneId))
    }
  }
  item('Open in Finder', () => {
    const cwd = panes.get(paneId)?.cwd
    if (cwd) window.crafterm.openPath(cwd)
  })
  item('Open URL in browser…', () => paneActions.openUrl())
  item('Track time…', () => paneActions.trackTime(paneId))
  if (opts.worktree !== false) item('Create worktree…', () => paneActions.createWorktree(paneId))

  // Git quick-actions (terminal panes in a repo). Each runs in a fresh split.
  if (opts.worktree !== false) {
    section('Git')
    item('Pull', () => paneActions.git(paneId, 'pull'))
    item('Commit + push…', () => paneActions.git(paneId, 'commitPush'))
    item('Commit + push + PR…', () => paneActions.git(paneId, 'commitPushPr'))
    item('New branch + PR…', () => paneActions.git(paneId, 'branchPr'))
    item('Stash changes…', () => paneActions.git(paneId, 'stash'))
    item('Stashes…', () => paneActions.stashes(paneId))
  }
  // Project / application "run commands". A command is surfaced when the pane is
  // tied to its owning project/app (`projectId`/`appId`), OR — falling back to a
  // path match — when the pane's cwd lives under the project/app working
  // directory. All matching projects/apps are listed (nested projects included).
  if (opts.bg !== false) {
    const pane = panes.get(paneId)
    const cwd = pane?.cwd ?? null
    const addCommands = (title: string, cmds?: ProjectCommand[]): void => {
      if (!cmds || !cmds.some((c) => c.command.trim())) return
      section(title)
      for (const rc of cmds) {
        const cmdStr = rc.command.trim()
        if (!cmdStr) continue
        item(rc.name || cmdStr, () => window.crafterm.input(paneId, cmdStr + '\r'))
      }
    }
    // cwd is under `base` (same dir or a descendant). Empty base never matches.
    const cwdUnder = (base?: string): boolean => {
      if (!cwd || !base) return false
      const b = base.replace(/\/+$/, '')
      return cwd === b || cwd.startsWith(b + '/')
    }
    // App `path` is relative to its project path (absolute or empty = project path).
    const appDir = (project: ProjectNode, app: Application): string => {
      const p = app.path?.trim()
      if (!p) return project.path
      return p.startsWith('/') ? p : `${project.path.replace(/\/+$/, '')}/${p}`
    }

    const projectIds = new Set<string>()
    const appIds = new Set<string>()
    if (pane?.projectId) {
      const proj = findProjectById(state.tree, pane.projectId)
      if (proj) {
        projectIds.add(proj.id)
        addCommands(`Commands — ${proj.name}`, proj.runCommands)
      }
    }
    if (pane?.appId) {
      const r = findApp(state.tree, pane.appId)
      if (r) {
        appIds.add(r.app.id)
        addCommands(`Commands — ${r.app.name}`, r.app.runCommands)
      }
    }
    for (const proj of flattenProjects(state.tree)) {
      if (!projectIds.has(proj.id) && cwdUnder(proj.path)) {
        projectIds.add(proj.id)
        addCommands(`Commands — ${proj.name}`, proj.runCommands)
      }
      for (const app of proj.apps ?? []) {
        if (!appIds.has(app.id) && cwdUnder(appDir(proj, app))) {
          appIds.add(app.id)
          addCommands(`Commands — ${app.name}`, app.runCommands)
        }
      }
    }

    // Applications defined on the matching projects — clicking one opens a
    // Split / New tab chooser (per environment) and launches it.
    for (const proj of flattenProjects(state.tree)) {
      if (!projectIds.has(proj.id)) continue
      const apps = proj.apps ?? []
      if (!apps.length) continue
      section(`Apps — ${proj.name}`)
      for (const app of apps) item(app.name, () => paneActions.runApp(proj, app))
    }
  }

  // SSH connections (only for terminal panes — sends the ssh command into the
  // current PTY instead of spawning a new terminal, per user request).
  if (opts.bg !== false && settings.sshConnections.length) {
    section('SSH')
    for (const c of settings.sshConnections) {
      const target = c.user ? `${c.user}@${c.host}` : c.host
      const cmd = c.port ? `ssh -p ${c.port} ${target}` : `ssh ${target}`
      item(c.label || target, () => window.crafterm.input(paneId, cmd + '\r'))
    }
  }

  // pop-out is for plain terminal panes only (same gate as the bg swatches)
  if (opts.bg !== false) item('Pop out to window', () => paneActions.popOut(paneId))

  // per-pane background color (terminals only)
  if (opts.bg !== false) {
    section('Background')
    out.push({
      kind: 'swatch',
      label: 'Pane background: Default',
      color: null,
      run: () => setPaneBackground(paneId, null)
    })
    PANE_BG_PALETTE.forEach((c) => {
      out.push({
        kind: 'swatch',
        label: `Pane background: ${c}`,
        color: c,
        run: () => setPaneBackground(paneId, c)
      })
    })
  }
  return out
}

// Per-pane options menu (anchored under the ⋯ button).
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

  // Consecutive swatch entries share a single color-swatches row.
  let swatchRow: HTMLElement | null = null
  for (const e of buildPaneMenu(paneId, opts)) {
    if (e.kind === 'swatch') {
      if (!swatchRow) {
        swatchRow = document.createElement('div')
        swatchRow.className = 'color-swatches'
        menu.appendChild(swatchRow)
      }
      const s = document.createElement('button')
      s.className = 'swatch' + (e.color === null ? ' none' : '')
      if (e.color) s.style.background = e.color
      else s.title = 'Default'
      s.addEventListener('click', () => {
        menu.remove()
        e.run()
      })
      swatchRow.appendChild(s)
      continue
    }
    swatchRow = null
    if (e.kind === 'label') {
      const lab = document.createElement('div')
      lab.className = 'menu-label'
      lab.textContent = e.text
      menu.appendChild(lab)
      continue
    }
    const b = document.createElement('button')
    b.textContent = e.label
    b.addEventListener('click', () => {
      menu.remove()
      e.run()
    })
    menu.appendChild(b)
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

  const copyBtn = document.createElement('button')
  copyBtn.className = 'pane-btn'
  copyBtn.textContent = '⧉'
  copyBtn.title = 'Copy full path'
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(source)
    const prev = copyBtn.textContent
    copyBtn.textContent = '✓'
    setTimeout(() => (copyBtn.textContent = prev), 1000)
  })
  const revealBtn = document.createElement('button')
  revealBtn.className = 'pane-btn'
  revealBtn.textContent = '⌕'
  revealBtn.title = 'Show in Finder'
  revealBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (absolute) window.crafterm.revealPath(source)
    else window.crafterm.nbReveal(source)
  })
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
  header.append(htitle, copyBtn, revealBtn, refreshBtn, editBtn, close)

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

  // ---- "add to chat": select text in the preview, send a `path:line` reference
  // into the active terminal (mirrors the diff/file panes). Only for real disk
  // files (absolute), where the path means something to Claude.
  if (absolute) {
    const chatBtn = document.createElement('button')
    chatBtn.className = 'doc-chat-btn'
    chatBtn.textContent = '+ chat'
    chatBtn.title = 'Send this selection as a file:line reference to the terminal'
    chatBtn.style.display = 'none'
    el.appendChild(chatBtn)

    // Source line of the block containing a DOM node (nearest [data-mdline]).
    const lineOf = (node: Node | null): number | null => {
      const start = node instanceof HTMLElement ? node : node?.parentElement ?? null
      const block = start?.closest('[data-mdline]') as HTMLElement | null
      const v = block?.getAttribute('data-mdline')
      return v ? parseInt(v, 10) : null
    }
    const activeTerminal = (): string | null =>
      state.activePaneId && panes.has(state.activePaneId) ? state.activePaneId : null

    let pendingRef: string | null = null
    const updateFromSelection = (): void => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        chatBtn.style.display = 'none'
        return
      }
      if (!preview.contains(sel.anchorNode) || !preview.contains(sel.focusNode)) {
        chatBtn.style.display = 'none'
        return
      }
      const a = lineOf(sel.anchorNode)
      const b = lineOf(sel.focusNode)
      if (a == null && b == null) {
        chatBtn.style.display = 'none'
        return
      }
      const lo = Math.min(a ?? b!, b ?? a!)
      const hi = Math.max(a ?? b!, b ?? a!)
      const cwd = panes.get(activeTerminal() ?? '')?.cwd ?? null
      let file = source
      if (cwd) {
        const base = cwd.endsWith('/') ? cwd : cwd + '/'
        if (source.startsWith(base)) file = source.slice(base.length)
      }
      pendingRef = lo === hi ? `${file}:${lo}` : `${file}:${lo}-${hi}`
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      chatBtn.style.left = `${Math.round(rect.right + 4)}px`
      chatBtn.style.top = `${Math.round(rect.top - 4)}px`
      chatBtn.style.display = ''
    }
    preview.addEventListener('mouseup', () => setTimeout(updateFromSelection, 0))
    preview.addEventListener('mousedown', () => {
      chatBtn.style.display = 'none'
    })
    preview.addEventListener('scroll', () => {
      chatBtn.style.display = 'none'
    })
    chatBtn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    chatBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const target = activeTerminal()
      if (!pendingRef || !target) return
      window.crafterm.input(target, pendingRef + ' ')
      paneActions.select(target)
      panes.get(target)?.term.focus()
      chatBtn.style.display = 'none'
    })
  }

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

// Heuristic: does the recent terminal tail look like Claude is waiting on a
// yes/no or a choice? Used to re-tone a 'done' notification to 'question' when
// the pane is actually idle-waiting on the user, not actually finished.
const CLAUDE_QUESTION_PATTERNS: RegExp[] = [
  /do you want to/i,
  /would you like/i,
  /are you sure/i,
  /should i (?:continue|proceed|go ahead|run|stop|skip)/i,
  /(?:^|\n)\s*(?:1\.|2\.|❯).{0,80}(?:yes|no)\b/i,
  // Claude's interactive selection menu (AskUserQuestion / ExitPlanMode) renders
  // a `❯` cursor on the highlighted option, regardless of the option text — catch
  // it without the yes/no constraint above. The glyph is rare in normal output.
  /(?:^|\n)\s*❯\s+\S/,
  /press\s+(?:y|enter|any key|return)\b/i,
  /\(y\/n\)/i,
  /\?\s*$/m,
  /awaiting your reply/i,
  /confirm[:?]/i
]
function looksLikeClaudeQuestion(tail: string): boolean {
  if (!tail) return false
  // Look only at the last ~1500 chars — older prompts shouldn't drive the
  // classification of a fresh idle event.
  const window = tail.slice(-1500)
  return CLAUDE_QUESTION_PATTERNS.some((re) => re.test(window))
}

export function markBusy(pane: Pane): void {
  pane.busy = true
  pane.lastActivity = Date.now() // terminal output counts as activity (idle detection)
  syncPaneStatus(pane)
  if (pane.idleTimer) clearTimeout(pane.idleTimer)
  pane.idleTimer = window.setTimeout(() => {
    pane.busy = false
    // The armed command (busySince set on Enter) went quiet for 700ms. If it ran
    // long enough, ping when the user is looking elsewhere, then disarm so we ping
    // once per command. While still under the threshold we keep waiting (a quiet
    // gap inside the command, e.g. `sleep`, must not disarm it).
    if (pane.busySince > 0 && Date.now() - pane.busySince >= LONG_RUN_MS) {
      // Claude panes: scan the recent buffer tail for question cues so a card
      // that's really waiting on user input shows up amber, not green.
      const event: 'question' | 'done' =
        pane.claude && looksLikeClaudeQuestion(pane.outputTail) ? 'question' : 'done'
      const body =
        event === 'question'
          ? `${pane.title || 'zsh'} is waiting for you`
          : `${pane.title || 'zsh'} finished`
      if (notifyPane(pane, body, event)) pane.attention = true
      pane.busySince = 0
    }
    syncPaneStatus(pane)
    requestStatuses()
  }, 700)
  requestStatuses()
}

export function paneStatus(p: Pane): PaneStatus {
  return p.attention ? 'attention' : p.busy ? 'running' : 'idle'
}

// Keep the persisted lifecycle status (NodeStatus on the stableId-keyed node) in
// sync with the live busy/claude signals. The visual sidebar dot still uses
// paneStatus()/claudeStatus; this is the durable status that round-trips through
// persistence. 'archived' is terminal — never auto-overwritten here.
export function syncPaneStatus(pane: Pane): void {
  if (pane.status === 'archived') return
  const next: NodeStatus =
    pane.claudeStatus === 'question'
      ? 'waiting'
      : pane.busy || pane.claudeStatus === 'in-progress'
        ? 'running'
        : 'idle'
  if (next !== pane.status) {
    pane.status = next
    saveSoon()
  }
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
  const proj = pane.projectId ? findProjectById(state.tree, pane.projectId) : null
  pushNotification(pane.id, pane.title || 'zsh', group, body, {
    kind: 'pane',
    event,
    branch: pane.branch,
    worktree: pane.worktree,
    cwd: pane.cwd,
    projectColor: proj?.color ?? undefined
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
  // For a Claude pane, the session jsonl is the single source of truth for the
  // title (applyClaudeSessionTitle). Ignoring the terminal's own OSC title here
  // stops a shell/cwd repaint from clobbering a freshly /rename'd title — the
  // race behind "sometimes the rename sticks" — and keeps a cwd title off the
  // tab label in the brief window before the session id is captured.
  const claudeDriven = pane.claude
  if (!pane.titleLocked && !claudeDriven && clean) {
    pane.title = clean
    pane.htitle.textContent = clean
  }
  mirrorPaneTitleToTab(pane)
  requestSidebar()
  saveSoon()
}

// A single-pane tab's sidebar label mirrors its pane's title. Shared by the OSC
// title path and the Claude session-title path so a /rename updates the main tab
// label, not just the per-pane sub-row.
function mirrorPaneTitleToTab(pane: Pane): void {
  const tab = findTabByPane(state.tree, pane.id)
  if (tab && !tab.titleLocked) {
    const firstPaneTitle = panes.get(firstPaneId(tab.root))?.title
    if (firstPaneTitle) tab.title = firstPaneTitle
  }
}

function firstPaneId(node: import('./types').LayoutNode): string {
  return node.type === 'leaf' ? node.paneId : firstPaneId(node.children[0])
}

// A plan belongs to a pane when its `--pane-<uuid>` tag matches the pane's
// stableId, or its trailing `-<sessionId>` matches the Claude session id this
// pane captured. The session-id match is what lets plans written by the
// SessionStart hook (which appends the Claude session id, not the pane id)
// attach to the pane that produced them.
export function isPlanOwnedByPane(
  plan: { ownerStableId: string | null; ownerSessionId: string | null },
  pane: Pane
): boolean {
  if (plan.ownerStableId && plan.ownerStableId === pane.stableId) return true
  if (plan.ownerSessionId && plan.ownerSessionId === pane.claudeSessionId) return true
  return false
}

export async function refreshPanePlans(pane: Pane): Promise<void> {
  const plans =
    pane.cwd && pane.branch ? await window.crafterm.plansForBranch(pane.cwd, pane.branch) : []
  const sig = (
    a: { path: string; ownerStableId: string | null; ownerSessionId: string | null }[]
  ): string => a.map((x) => `${x.path}|${x.ownerStableId ?? ''}|${x.ownerSessionId ?? ''}`).join('§')
  if (sig(plans) !== sig(pane.plans)) {
    // Did this pane just gain its first owned plan? Auto-expand the tab's
    // details so the user sees the plan attach without having to click the
    // chevron. Skip when the user has already opened/closed details manually
    // and at least one owned plan exists — only flip on the empty→non-empty edge.
    const ownedNow = plans.filter((p) => isPlanOwnedByPane(p, pane)).length
    const ownedBefore = pane.plans.filter((p) => isPlanOwnedByPane(p, pane)).length
    // Plans this pane owns that weren't present on the previous sync — auto-open
    // each as a new markdown tab in this pane's group for review (plan mode).
    const prevOwned = new Set(
      pane.plans.filter((p) => isPlanOwnedByPane(p, pane)).map((p) => p.path)
    )
    const newlyOwned = plans.filter((p) => isPlanOwnedByPane(p, pane) && !prevOwned.has(p.path))
    pane.plans = plans
    if (ownedBefore === 0 && ownedNow > 0) {
      const tab = findTabByPane(state.tree, pane.id)
      if (tab && !tab.detailsOpen) tab.detailsOpen = true
    }
    // Skip the very first population so existing plans aren't opened on launch.
    // Then auto-open a plan only when BOTH hold: it was produced during this
    // live session (mtime newer than the pane's Claude launch) AND the session
    // is in plan mode right now (the JSONL's last permission-mode is 'plan').
    // Pre-existing plans that merely become "owned" when the session id is
    // captured (or when the in-memory list transiently empties on a branch/cwd
    // blip) have an older mtime; plans touched outside plan mode fail the mode
    // check. Either way they stay listed under the terminal node, not opened.
    if (pane.plansSynced) {
      const liveSince = pane.claudeSpawnedAt ?? Number.POSITIVE_INFINITY
      const fresh = newlyOwned.filter((p) => p.mtime >= liveSince)
      if (fresh.length && pane.claude && pane.cwd && pane.claudeSessionId) {
        const mode = await window.crafterm.claudePermissionMode(pane.cwd, pane.claudeSessionId)
        if (mode === 'plan') {
          for (const plan of fresh) {
            // Auto-open disabled: plan stays listed under the terminal node
            // instead of opening in a group.
            // paneActions.openPlanInGroup(pane.id, plan.path)
            pane.planMode = true
          }
        }
      }
    }
    pane.plansSynced = true
    requestSidebar()
  }
}

// Poll the session JSONL for this Claude pane's coarse state (in-progress /
// question / idle) and reflect it on the sidebar when it changes.
export async function refreshClaudeStatus(pane: Pane): Promise<void> {
  if (!pane.claude || !pane.cwd || !pane.claudeSessionId) {
    if (pane.claudeStatus) {
      pane.claudeStatus = undefined
      requestSidebar()
    }
    return
  }
  try {
    const s = await window.crafterm.claudeSessionStatus(pane.cwd, pane.claudeSessionId)
    let next = s ?? undefined
    // Reconcile the JSONL state with the terminal tail using the SAME question
    // heuristic the notification sound uses (looksLikeClaudeQuestion). The JSONL
    // tail can't tell "Claude is working" apart from "Claude is blocked on the
    // user" — an AskUserQuestion/ExitPlanMode tool_use or a permission prompt
    // both read as in-progress there. When the visible output is a prompt
    // awaiting the user, surface it as a question so the badge matches the sound.
    if (next === 'in-progress' && looksLikeClaudeQuestion(pane.outputTail)) {
      next = 'question'
    }
    if (next !== pane.claudeStatus) {
      pane.claudeStatus = next
      syncPaneStatus(pane)
      requestSidebar()
    }
  } catch {
    // best-effort — leave the previous status in place
  }
}

export async function applyClaudeSessionTitle(pane: Pane): Promise<void> {
  if (!pane.cwd || !pane.claudeSessionId || pane.titleLocked) return
  try {
    const title = await window.crafterm.claudeSessionTitle(pane.cwd, pane.claudeSessionId)
    if (!title) return
    if (pane.title !== title) {
      pane.title = title
      pane.htitle.textContent = title
      mirrorPaneTitleToTab(pane)
      requestSidebar()
      saveSoon()
    }
  } catch {
    // ignore — best-effort title sync
  }
}

export async function refreshPaneInfo(pane: Pane): Promise<void> {
  const info = await window.crafterm.paneInfo(pane.id, pane.stableId)
  // A null cwd means we couldn't read the pane (lsof timed out under heavy load,
  // or the pty is gone) — never overwrite a known-good cwd/branch/worktree with
  // it. Persisting an empty location is exactly what made every terminal reopen
  // at ~ after a hard kill. Keep the last good values and skip the change-save.
  let cwdChanged = false
  if (info.cwd !== null) {
    cwdChanged = info.cwd !== pane.cwd
    pane.cwd = info.cwd
    pane.branch = info.branch
    pane.worktree = info.worktree
  }
  if (info.lastCommand) pane.lastCommand = info.lastCommand
  updatePaneStatus(pane)
  // Plan files for this branch (docs/plans/<branch>-*.md). We fetch every tick
  // (cheap — main reads a single directory) so new files appear without
  // needing a cwd/branch change. The fs.watch broadcast covers the live case.
  await refreshPanePlans(pane)
  // For Claude panes, capture the session id this pane is writing to so restore
  // can `claude --resume <id>` the exact conversation that was open here. We
  // filter by `claudeSpawnedAt` so the id we pick is one that appeared after
  // this pane launched claude — never a sibling pane's session in the same cwd.
  // Once captured, we lock it so the periodic refresh never overwrites it with
  // whichever jsonl happens to be newest globally for the cwd.
  if (pane.claude && pane.cwd && !pane.claudeSessionLocked) {
    const since = pane.claudeSpawnedAt ?? 0
    const sid = await window.crafterm.claudeLatestSession(pane.cwd, since)
    if (sid) {
      if (sid !== pane.claudeSessionId) pane.claudeSessionId = sid
      pane.claudeSessionLocked = true
      saveSoon()
      // Pull the /rename custom-title immediately so the sidebar reflects it
      // without having to wait for the next xterm OSC repaint. Re-check at 1s
      // and 3s because Claude may write the title slightly after spawn.
      applyClaudeSessionTitle(pane)
      setTimeout(() => applyClaudeSessionTitle(pane), 1000)
      setTimeout(() => applyClaudeSessionTitle(pane), 3000)
    }
  } else if (pane.claude && pane.cwd && pane.claudeSessionId && !pane.titleLocked) {
    // Already locked: refresh in the background so /rename inside the session
    // updates the title without requiring a full pane restart.
    applyClaudeSessionTitle(pane)
  }
  // Ensure a live watcher on this session's project dir so /rename reflects
  // instantly (the watcher re-reads the title on jsonl change). Idempotent in
  // main, so calling every tick is cheap.
  if (pane.claude && pane.cwd && pane.claudeSessionId) {
    void window.crafterm.watchClaudeSessions(pane.cwd)
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
    const proj = findProjectByPath(state.tree, pane.trackProjectPath)
    const feat = pane.trackFeatureId ? findFeature(state.tree, pane.trackFeatureId)?.feature : null
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
