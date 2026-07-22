import { Terminal, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Pane } from '@views/types/types'
import { panes, opened, settings, resolveTheme, paneActions, state } from '@views/state/spine'
import { persistence, recordCommand } from '@repositories/persistence.service'
import { terminalService, pathForFile } from '@services'
import { commandRunsClaude } from './activity-detection'
import { showPaneMenu } from '@views/pane/pane'

// Push the pane's current geometry to the PTY, but only when it actually changed.
// A tab switch detaches/reattaches the pane element, which re-fires the
// ResizeObserver at the same size; without this guard every switch would send a
// no-op resize → SIGWINCH → a full TUI repaint (and a scroll jump on reflow).
export function pushResize(pane: Pane): void {
  const { cols, rows } = pane.term
  if (cols === pane.lastCols && rows === pane.lastRows) return
  pane.lastCols = cols
  pane.lastRows = rows
  terminalService.resize(pane.id, cols, rows)
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

export function applyPaneTheme(p: Pane): void {
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
export function makeLinkProvider(
  term: Terminal
): { provideLinks: (y: number, cb: (links: ILink[] | undefined) => void) => void } {
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

// Builds the initial Pane record. `ro` is filled in by the view once the
// ResizeObserver exists. cwd is seeded from the spawn path (absolute only) so the
// pane is never null during the post-restore window.
export function createPaneState(args: {
  id: string
  stableId: string
  term: Terminal
  fit: FitAddon
  el: HTMLDivElement
  host: HTMLDivElement
  statusEl: HTMLDivElement
  htitle: HTMLSpanElement
  cwd?: string
  isProcessView: boolean
}): Pane {
  return {
    id: args.id,
    stableId: args.stableId,
    term: args.term,
    fit: args.fit,
    el: args.el,
    host: args.host,
    statusEl: args.statusEl,
    htitle: args.htitle,
    ro: null as unknown as ResizeObserver,
    busy: false,
    busySince: 0,
    attention: false,
    idleTimer: null,
    title: '',
    titleLocked: false,
    cwd: args.cwd && args.cwd.startsWith('/') ? args.cwd : null,
    branch: null,
    worktree: null,
    lastCommand: null,
    plans: [],
    claude: false,
    claudeSessionId: null,
    claudeSpawnedAt: null,
    claudeSessionLocked: false,
    lastClaudeTitle: null,
    bgColor: null,
    fontSize: null,
    trackProjectPath: null,
    trackFeatureId: null,
    projectId: null,
    appId: null,
    dailyTaskId: null,
    status: 'idle',
    role: 'shell',
    isProcessView: args.isProcessView,
    lastActivity: Date.now(),
    lastNotify: 0,
    lastCols: 0,
    lastRows: 0,
    outputTail: ''
  }
}

// Shift+Enter / Option(Alt)+Enter insert a newline in TUI line editors (e.g.
// Claude's prompt) instead of submitting. A bare CR/LF reads as "submit", so we
// wrap a CR in a bracketed-paste sequence (ESC[200~ … ESC[201~): Ink-based TUIs
// treat pasted line breaks as newlines. Scoped to Enter so other Option+key
// combos keep their special chars.
export function makeCustomKeyHandler(id: string): (e: KeyboardEvent) => boolean {
  return (e) => {
    if (e.type === 'keydown' && e.key === 'Enter' && (e.shiftKey || e.altKey) && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      terminalService.input(id, '\x1b[200~\r\x1b[201~')
      return false
    }
    return true
  }
}

// Backslash-escape every character that is not shell-safe, so a dropped path
// with spaces/parens/etc. pastes as a single usable argument (Terminal.app
// behaviour). The safe set is the conventional POSIX shell-quote allowlist.
function escapeShellPath(path: string): string {
  return path.replace(/[^A-Za-z0-9_@%+=:,./-]/g, '\\$&')
}

// Turn dropped absolute paths into the text written to the PTY: each path
// escaped, space-joined for multi-file drops, with a trailing space so the
// next argument (or Enter) follows cleanly. Empty when nothing usable dropped.
export function formatDroppedPaths(paths: string[]): string {
  const usable = paths.filter((p) => p.length > 0)
  if (usable.length === 0) return ''
  return usable.map(escapeShellPath).join(' ') + ' '
}

// Finder → terminal file drop: on drop, resolve each File to its absolute path
// and write the escaped path(s) into the PTY as if typed. dragover must
// preventDefault (only for OS file drags) or the drop never fires; guarding on
// the 'Files' type leaves internal pane-rearrange drags untouched.
export function makeFileDrop(id: string): {
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
} {
  const isFileDrag = (e: DragEvent): boolean =>
    !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
  return {
    onDragOver: (e) => {
      if (!isFileDrag(e)) return
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'copy'
    },
    onDrop: (e) => {
      const files = e.dataTransfer?.files
      if (!files || files.length === 0) return
      e.preventDefault()
      const paths = Array.from(files).map((f) => pathForFile(f))
      const text = formatDroppedPaths(paths)
      if (!text) return
      terminalService.input(id, text)
      panes.get(id)?.term.focus()
    }
  }
}

// xterm onData handler: forwards keystrokes to the PTY and tracks the typed
// command buffer for activity + Claude detection. Owns its own `cmdBuf` closure.
export function makeDataHandler(pane: Pane, id: string): (data: string) => void {
  let cmdBuf = ''
  return (data) => {
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
  }
}

// ---- header button handlers (R4) ----
export function makeTaskChipClick(id: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    paneActions.viewTicketDetail(id)
  }
}

export function makeMenuClick(id: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    showPaneMenu(e.currentTarget as HTMLButtonElement, id)
  }
}

export function makeCloseClick(id: string): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    paneActions.close(id)
  }
}

export function makeSelectPane(id: string): () => void {
  return () => paneActions.select(id)
}

// ---- font sizing ----
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
