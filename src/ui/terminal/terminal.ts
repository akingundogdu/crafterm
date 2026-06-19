import { Terminal, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Pane } from '../types'
import {
  panes,
  opened,
  settings,
  resolveTheme,
  requestSidebar,
  paneActions,
  state
} from '../state'
import { persistence, recordCommand } from '@services/storage/persistence.service'
import { terminalService } from '@services'
import { onPaneTitle } from './osc-title'
import { commandRunsClaude, onBell } from './activity-detection'
import { refreshPaneInfo } from './pane-info'
import { setupPaneDnd, showPaneMenu } from '../pane'

// Push the pane's current geometry to the PTY, but only when it actually changed.
// A tab switch detaches/reattaches the pane element, which re-fires the
// ResizeObserver at the same size; without this guard every switch would send a
// no-op resize → SIGWINCH → a full TUI repaint (and a scroll jump on reflow).
function pushResize(pane: Pane): void {
  const { cols, rows } = pane.term
  if (cols === pane.lastCols && rows === pane.lastRows) return
  pane.lastCols = cols
  pane.lastRows = rows
  terminalService.resize(pane.id, cols, rows)
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
    : await terminalService.createPty({ cwd, env, shell: opts?.shell })

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
      terminalService.input(id, '\x1b[200~\r\x1b[201~')
      return false
    }
    return true
  })

  term.registerLinkProvider(makeLinkProvider(term))
  let cmdBuf = ''
  term.onData((data) => {
    terminalService.input(id, data)
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
          persistence.save() // persist the claude flag promptly (don't wait for the next capture)
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
  persistence.save()
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
    persistence.save()
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
