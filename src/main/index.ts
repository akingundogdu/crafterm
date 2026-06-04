import { app, BrowserWindow, ipcMain, Notification, Menu, shell, nativeImage, safeStorage } from 'electron'
import type { WebContents } from 'electron'
import { join, dirname } from 'path'
import { homedir } from 'os'
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  watch as fsWatch,
  type FSWatcher
} from 'fs'
import { parsePlanFilename } from './planFilename'
import { execFile, spawn } from 'child_process'
import * as pty from 'node-pty'
import { registerDbIpc } from './db'
import { registerDockerIpc } from './docker'
import { registerPrIpc } from './pr'

const APP_NAME = 'Crafterm'
// macOS uses this for the app menu / notification name; set it before whenReady.
app.setName(APP_NAME)

// Database tool: Postgres/MySQL/SQLite connect + query IPC (db:*).
registerDbIpc()

// Docker tool: containers/images/volumes/networks/compose + actions (docker:*).
registerDockerIpc()

// PR panel: GitHub PR list + CI checks + merge via the gh CLI (pr:*).
registerPrIpc()

let mainWindow: BrowserWindow | null = null
let quitting = false

// One real PTY (zsh) per terminal pane, keyed by an id we hand back to the renderer.
const ptys = new Map<string, pty.IPty>()
// Which window currently receives a pane's output (main window, or a pop-out).
const owners = new Map<string, WebContents>()
// Open pop-out windows, keyed by the pane id they host.
const popouts = new Map<string, BrowserWindow>()
// The single detached "Improve Crafterm" window, if open.
let improveWin: BrowserWindow | null = null
// Pane ids whose pop-out window is allowed to actually close (kill confirmed).
const allowClose = new Set<string>()
let seq = 0

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    fullscreen: true, // always launch in native macOS fullscreen
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset', // native traffic lights floating over the sidebar
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true // embedded browser panes (opening terminal links in-app)
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  // Tell the renderer about fullscreen state — macOS hides the traffic lights
  // while fullscreen, so the renderer can drop the left-side padding reserved
  // for them. Re-broadcast on every transition and once on initial load.
  const broadcastFullscreen = (): void => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('window:fullscreen', mainWindow.isFullScreen())
    }
  }
  mainWindow.on('enter-full-screen', broadcastFullscreen)
  mainWindow.on('leave-full-screen', broadcastFullscreen)
  mainWindow.webContents.once('did-finish-load', broadcastFullscreen)

  // Drop the reference once the window is gone, so the guards in the PTY
  // callbacks short-circuit instead of touching a destroyed object.
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // electron-vite sets ELECTRON_RENDERER_URL in dev (Vite server); in prod we load the built file.
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Guard every renderer message: during shutdown a PTY can still emit data/exit
// after the window's webContents is destroyed. A plain `mainWindow?.` check is
// not enough — the object is destroyed but not null — so `.send()` would throw
// "Object has been destroyed" (one uncaught exception, i.e. one dialog, per PTY).
function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

// Route a pane's stream to the window that currently owns it (a pop-out window,
// or the main window by default). Same destroyed-guards as sendToRenderer.
function sendToOwner(id: string, channel: string, payload: unknown): void {
  const wc = owners.get(id)
  if (wc && !wc.isDestroyed()) {
    wc.send(channel, payload)
    return
  }
  sendToRenderer(channel, payload)
}

// --- PTY bridge: this is where "web" reaches the real shell, via the Node main process ---

ipcMain.handle(
  'pty:create',
  (e, opts: { cwd?: string; env?: Record<string, string>; shell?: string }) => {
    const id = String(++seq)
    owners.set(id, e.sender) // the window that created it receives its output
    const shell = opts?.shell || process.env.SHELL || '/bin/zsh'
    let cwd = opts?.cwd || homedir()
    if (cwd.startsWith('~')) cwd = join(homedir(), cwd.slice(1))
    if (!existsSync(cwd)) cwd = homedir() // fall back if the saved path is gone
    // Renderer-supplied env wins over the inherited environment so that
    // CRAFTERM_PANE_ID always reflects the pane that owns this PTY.
    const env = { ...process.env, ...(opts?.env ?? {}) }
    if (opts?.env?.CRAFTERM_PANE_ID) env.CRAFTERM_PANE_ID = opts.env.CRAFTERM_PANE_ID
    const p = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: env as { [key: string]: string }
    })

  // Both callbacks are invoked by node-pty through a native ThreadSafeFunction.
  // A throw escaping here (e.g. webContents.send() on a disposed frame during
  // shutdown) is turned into an uncatchable C++ exception by node-pty and
  // aborts the whole process — it does NOT route through `uncaughtException`.
  // So every callback body must be wrapped to never throw back into native code.
  p.onData((data) => {
    try {
      sendToOwner(id, 'pty:data', { id, data })
    } catch {
      /* renderer gone / frame disposed — never let it reach node-pty */
    }
  })
  p.onExit(() => {
    try {
      sendToOwner(id, 'pty:exit', { id })
    } catch {
      /* ignore: same teardown race as above */
    }
    ptys.delete(id)
    owners.delete(id)
  })

  ptys.set(id, p)
  return id
})

// A pop-out window adopts an existing pane: its output now flows to that window.
ipcMain.on('pty:adopt', (e, { id }: { id: string }) => {
  if (ptys.has(id)) owners.set(id, e.sender)
})

ipcMain.on('pty:input', (_e, { id, data }: { id: string; data: string }) => {
  ptys.get(id)?.write(data)
})

ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  try {
    ptys.get(id)?.resize(cols, rows)
  } catch {
    /* resize can throw if the pty just died — safe to ignore */
  }
})

ipcMain.on('pty:kill', (_e, { id }: { id: string }) => {
  ptys.get(id)?.kill()
  ptys.delete(id)
  owners.delete(id)
})

// --- Pop-out windows: host a single pane's terminal in its own window ---

function createPopoutWindow(paneId: string, title?: string): void {
  const existing = popouts.get(paneId)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return
  }
  const win = new BrowserWindow({
    width: 720,
    height: 480,
    backgroundColor: '#0d1117',
    title: title || APP_NAME,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  const qs = `id=${encodeURIComponent(paneId)}`
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/popout.html?${qs}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/popout.html'), { search: qs })
  }
  popouts.set(paneId, win)
  // The native close button needs a running-process confirm (done in the
  // pop-out renderer). Intercept unless we're quitting or the kill is confirmed.
  win.on('close', (e) => {
    if (quitting || allowClose.has(paneId)) return
    e.preventDefault()
    if (!win.webContents.isDestroyed()) win.webContents.send('popout:confirm-close', { id: paneId })
  })
  win.on('closed', () => {
    popouts.delete(paneId)
    allowClose.delete(paneId)
    owners.delete(paneId)
  })
}

ipcMain.handle('popout:open', (_e, { paneId, title }: { paneId: string; title?: string }) => {
  createPopoutWindow(paneId, title)
})

// The pop-out renderer confirmed the kill: close its window and tell the main
// window to drop the pane (which kills the PTY).
ipcMain.on('popout:close-confirmed', (_e, { id }: { id: string }) => {
  allowClose.add(id)
  popouts.get(id)?.close()
  sendToRenderer('popout:killed', { id })
})

ipcMain.on('popout:focus', (_e, { id }: { id: string }) => {
  const win = popouts.get(id)
  if (win && !win.isDestroyed()) win.focus()
})

// --- Improve Crafterm detached window: a standalone Improve panel window ---

ipcMain.handle('improve-window:open', () => {
  if (improveWin && !improveWin.isDestroyed()) {
    improveWin.focus()
    return
  }
  improveWin = new BrowserWindow({
    width: 760,
    height: 900,
    backgroundColor: '#0d1117',
    title: 'Improve Crafterm',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    improveWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/improve-window.html`)
  } else {
    improveWin.loadFile(join(__dirname, '../renderer/improve-window.html'))
  }
  improveWin.on('closed', () => {
    improveWin = null
  })
})

ipcMain.on('improve-window:set-always-on-top', (_e, { value }: { value: boolean }) => {
  if (improveWin && !improveWin.isDestroyed()) improveWin.setAlwaysOnTop(!!value)
})

// --- Tiny JSON store (saved layout + theme) in a dot-dir under $HOME ---

// Packaged app and dev mode keep separate state so dev experiments never clobber
// the installed app's saved sessions/layout.
const stateDir = (): string =>
  join(homedir(), app.isPackaged ? '.crafterm' : '.crafterm-dev')
const statePath = (): string => join(stateDir(), 'crafterm-state.json')

ipcMain.handle('store:load', () => {
  try {
    return existsSync(statePath()) ? JSON.parse(readFileSync(statePath(), 'utf8')) : null
  } catch {
    return null
  }
})

ipcMain.on('store:save', (_e, data: unknown) => {
  try {
    mkdirSync(stateDir(), { recursive: true })
    writeFileSync(statePath(), JSON.stringify(data, null, 2))
  } catch {
    /* ignore write errors */
  }
})

// --- Pane info (cwd via lsof, git branch) + native notifications ---

function run(cmd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 2000 }, (err, stdout) => {
      resolve(err ? null : stdout)
    })
  })
}

async function paneCwd(pid: number): Promise<string | null> {
  // -d cwd limits to the cwd descriptor; -Fn prints machine-readable lines, the
  // 'n' line holds the path. Works without any shell configuration.
  const out = await run('/usr/sbin/lsof', ['-a', '-d', 'cwd', '-p', String(pid), '-Fn'])
  if (!out) return null
  const line = out.split('\n').find((l) => l.startsWith('n'))
  return line ? line.slice(1) : null
}

function gitBin(): string {
  for (const p of ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git']) {
    if (existsSync(p)) return p
  }
  return 'git'
}

async function gitBranch(cwd: string): Promise<string | null> {
  const out = await run('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'])
  if (!out) return null
  const branch = out.trim()
  return branch && branch !== 'HEAD' ? branch : null
}

// Basename of the toplevel folder, but only when cwd is inside a *linked* git
// worktree (git worktree add ...). Linked worktrees keep their git dir under
// <main>/.git/worktrees/<name>; the main checkout does not. Returns null in the
// main checkout / outside a repo, so the status bar only flags real worktrees.
async function gitWorktreeName(cwd: string): Promise<string | null> {
  const gitDir = await run('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'])
  if (!gitDir || !gitDir.includes('/worktrees/')) return null
  const out = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])
  if (!out) return null
  const top = out.trim()
  return top ? top.split('/').pop() || null : null
}

ipcMain.handle('pane:info', async (_e, { id }: { id: string }) => {
  const p = ptys.get(id)
  if (!p) return { cwd: null, branch: null, worktree: null }
  const cwd = await paneCwd(p.pid)
  const [branch, worktree] = cwd
    ? await Promise.all([gitBranch(cwd), gitWorktreeName(cwd)])
    : [null, null]
  return { cwd, branch, worktree }
})

// Local branches for the repo a pane is in, most-recently-committed first.
ipcMain.handle('git:branches', async (_e, { id }: { id: string }) => {
  const p = ptys.get(id)
  if (!p) return []
  const cwd = await paneCwd(p.pid)
  if (!cwd) return []
  const out = await run(gitBin(), [
    '-C',
    cwd,
    'branch',
    '--format=%(refname:short)',
    '--sort=-committerdate'
  ])
  if (!out) return []
  return out
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
})

// List git stashes for the repo a pane is in: [{ ref: 'stash@{0}', description }].
ipcMain.handle('git:stashList', async (_e, { id }: { id: string }) => {
  const p = ptys.get(id)
  if (!p) return []
  const cwd = await paneCwd(p.pid)
  if (!cwd) return []
  const out = await run(gitBin(), ['-C', cwd, 'stash', 'list', '--format=%gd%x00%s'])
  if (!out) return []
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref, description = ''] = line.split('\x00')
      return { ref, description }
    })
})

// --- Claude session history (~/.claude/projects/<encoded-cwd>/<id>.jsonl) ---
// Claude encodes a project's cwd into the dir name by replacing "/" and "." with "-".
function encodeClaudeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}
const claudeProjectsDir = (): string => join(homedir(), '.claude', 'projects')

// Newest session id for a cwd, optionally restricted to sessions modified after
// `since` (ms epoch). The pane that spawned `claude` passes its spawn timestamp
// so the resulting id always belongs to *this* pane — never to an older sibling
// session in the same cwd. Without `since` the call returns whatever's newest
// (legacy behavior, still used by readers that just want "any session here").
// ---- Secrets (Accounts) ----
// safeStorage-encrypted blobs stored under <stateDir>/secrets/<id>/<key>.bin.
// The JSON state file only references the (id, key) pair; the secret value
// itself never lives in plaintext on disk. macOS uses Keychain under the hood.
function secretsDir(): string {
  return join(stateDir(), 'secrets')
}
function secretSafeName(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
}
function secretFilePath(entryId: string, key: string): string | null {
  const id = secretSafeName(entryId)
  const k = secretSafeName(key)
  if (!id || !k) return null
  return join(secretsDir(), id, k + '.bin')
}
ipcMain.handle('secrets:set', (_e, { entryId, key, value }: { entryId: string; key: string; value: string }) => {
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'safeStorage unavailable' }
  const p = secretFilePath(entryId, key)
  if (!p) return { ok: false, error: 'invalid id/key' }
  try {
    mkdirSync(join(p, '..'), { recursive: true })
    const enc = safeStorage.encryptString(value ?? '')
    writeFileSync(p, enc)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String((err as Error).message) }
  }
})
ipcMain.handle('secrets:get', (_e, { entryId, key }: { entryId: string; key: string }) => {
  if (!safeStorage.isEncryptionAvailable()) return null
  const p = secretFilePath(entryId, key)
  if (!p || !existsSync(p)) return null
  try {
    return safeStorage.decryptString(readFileSync(p))
  } catch {
    return null
  }
})
ipcMain.handle('secrets:delete', (_e, { entryId, key }: { entryId: string; key?: string }) => {
  try {
    const dir = join(secretsDir(), secretSafeName(entryId))
    if (!key) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
      return { ok: true }
    }
    const p = secretFilePath(entryId, key)
    if (p && existsSync(p)) unlinkSync(p)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String((err as Error).message) }
  }
})
ipcMain.handle('secrets:available', () => safeStorage.isEncryptionAvailable())

// Aggregate Claude token usage across every session under
// `~/.claude/projects/**/*.jsonl` for three periods (today, this week, this
// month) so the top status bar can show quota-style percentages. The "cap" used
// for percentages is configurable per-period (passed in from the renderer);
// without one we still return the raw totals. Cached for 30s.
interface ClaudePeriodTotals {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  totalTokens: number
}
interface ClaudeUsageSummary {
  today: ClaudePeriodTotals
  thisWeek: ClaudePeriodTotals
  thisMonth: ClaudePeriodTotals
  sessions: number // sessions touched today
  lastModel: string | null
  lastSpeed: string | null // 'standard' | 'fast' — from message.usage.speed
  thinkingDetected: boolean // was a `thinking` content block seen this week
  resetTimes: { day: number; week: number; month: number } // next reset (ms epoch)
}
let claudeUsageCache: { expiresAt: number; data: ClaudeUsageSummary } | null = null
function startOfDayMs(now: Date): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function startOfWeekMs(now: Date): number {
  // Week starts Monday 00:00 local. (Most Claude plans reset on a fixed
  // weekday — Monday is the closest universal anchor; users can correct via
  // configurable caps.)
  const d = new Date(now)
  const day = d.getDay() // 0 = Sun
  const back = (day + 6) % 7 // days since Monday
  d.setDate(d.getDate() - back)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function startOfMonthMs(now: Date): number {
  const d = new Date(now)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
function emptyTotals(): ClaudePeriodTotals {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 }
}
function addToPeriod(p: ClaudePeriodTotals, u: Record<string, unknown>): void {
  const ino = Number(u.input_tokens) || 0
  const outo = Number(u.output_tokens) || 0
  const cc = Number(u.cache_creation_input_tokens) || 0
  const cr = Number(u.cache_read_input_tokens) || 0
  p.inputTokens += ino
  p.outputTokens += outo
  p.cachedTokens += cc + cr
  p.totalTokens += ino + outo + cc + cr
}
ipcMain.handle('claude:usageSummary', () => {
  const now = Date.now()
  if (claudeUsageCache && claudeUsageCache.expiresAt > now) return claudeUsageCache.data
  const root = claudeProjectsDir()
  const nowDate = new Date(now)
  const dayStart = startOfDayMs(nowDate)
  const weekStart = startOfWeekMs(nowDate)
  const monthStart = startOfMonthMs(nowDate)
  const summary: ClaudeUsageSummary = {
    today: emptyTotals(),
    thisWeek: emptyTotals(),
    thisMonth: emptyTotals(),
    sessions: 0,
    lastModel: null,
    lastSpeed: null,
    thinkingDetected: false,
    resetTimes: {
      day: dayStart + 24 * 3600_000,
      week: weekStart + 7 * 24 * 3600_000,
      month: (() => {
        const d = new Date(monthStart)
        d.setMonth(d.getMonth() + 1)
        return d.getTime()
      })()
    }
  }
  if (!existsSync(root)) {
    claudeUsageCache = { expiresAt: now + 30_000, data: summary }
    return summary
  }
  let projDirs: string[] = []
  try {
    projDirs = readdirSync(root)
  } catch {
    claudeUsageCache = { expiresAt: now + 30_000, data: summary }
    return summary
  }
  for (const proj of projDirs) {
    const dir = join(root, proj)
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      const full = join(dir, f)
      let mtimeMs: number
      try {
        mtimeMs = statSync(full).mtimeMs
      } catch {
        continue
      }
      // Skip files untouched this month entirely.
      if (mtimeMs < monthStart) continue
      let touchedToday = false
      // Read enough of the tail to capture this month's records on hot files.
      // For older monthly data the tail is fine; for very large weekly files we
      // may miss earliest entries — acceptable for a rolling indicator.
      const text = readTail(full, 256 * 1024)
      for (const line of text.split('\n')) {
        if (!line.trim()) continue
        let o: Record<string, unknown>
        try {
          o = JSON.parse(line)
        } catch {
          continue
        }
        const ts =
          typeof o.timestamp === 'string' ? new Date(o.timestamp as string).getTime() : 0
        if (!ts || ts < monthStart) continue
        const msg = o.message as Record<string, unknown> | undefined
        if (!msg || typeof msg !== 'object') continue
        if (typeof msg.model === 'string') summary.lastModel = msg.model as string
        const u = msg.usage as Record<string, unknown> | undefined
        if (u && typeof u === 'object') {
          if (typeof u.speed === 'string') summary.lastSpeed = u.speed as string
          // Period bucketing (monthly is the outer guard above).
          addToPeriod(summary.thisMonth, u)
          if (ts >= weekStart) addToPeriod(summary.thisWeek, u)
          if (ts >= dayStart) {
            addToPeriod(summary.today, u)
            touchedToday = true
          }
        }
        const content = msg.content as unknown[] | undefined
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && typeof c === 'object' && (c as { type?: string }).type === 'thinking') {
              summary.thinkingDetected = true
              break
            }
          }
        }
      }
      if (touchedToday) summary.sessions++
    }
  }
  claudeUsageCache = { expiresAt: now + 30_000, data: summary }
  return summary
})

// --- Real Claude usage (official server-side limits) ---
// The token-count summary above is a rough local estimate against guessed caps.
// This pulls the SAME percentages the `/usage` command shows, straight from
// Anthropic's `GET /api/oauth/usage` endpoint, using the OAuth token Claude Code
// stores in the macOS keychain (or a user-provided fallback secret). `utilization`
// is already a server-computed 0-100 percentage — no local math, no caps.
interface RealUsageWindow {
  utilization: number // 0-100
  resetsAt: number // ms epoch
}
interface RealUsage {
  fiveHour: RealUsageWindow | null
  sevenDay: RealUsageWindow | null
  sevenDaySonnet: RealUsageWindow | null
  modelName: string | null
  fetchedAt: number
  error?: 'no-token' | 'auth-expired' | 'network' | 'unavailable'
}
interface OAuthToken {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number // ms epoch, 0 if unknown
}
const CLAUDE_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const CLAUDE_OAUTH_TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'
let realUsageCache: { expiresAt: number; data: RealUsage } | null = null

// Parse a stored credential blob. Claude's keychain entry is JSON
// (`{ claudeAiOauth: { accessToken, refreshToken, expiresAt } }`); a user
// fallback secret may be that same shape, a bare `{ accessToken }`, or a raw token.
function parseTokenBlob(raw: string | null): OAuthToken {
  if (!raw) return { accessToken: null, refreshToken: null, expiresAt: 0 }
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return { accessToken: trimmed, refreshToken: null, expiresAt: 0 }
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>
    const oauth = (o.claudeAiOauth as Record<string, unknown>) ?? o
    return {
      accessToken: typeof oauth.accessToken === 'string' ? oauth.accessToken : null,
      refreshToken: typeof oauth.refreshToken === 'string' ? oauth.refreshToken : null,
      expiresAt: Number(oauth.expiresAt) || 0
    }
  } catch {
    return { accessToken: trimmed, refreshToken: null, expiresAt: 0 }
  }
}

function readKeychainBlob(service: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (!service) return resolve(null)
    execFile(
      '/usr/bin/security',
      ['find-generic-password', '-s', service, '-w'],
      { timeout: 3000 },
      (err, stdout) => resolve(err ? null : (stdout || '').trim() || null)
    )
  })
}

// Best-effort refresh: only used when the stored access token is expired/rejected.
// Kept in memory — we deliberately do NOT write back to the keychain so Claude
// Code stays the single owner of the credential.
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(CLAUDE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLAUDE_OAUTH_CLIENT_ID
      }),
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return null
    const j = (await res.json()) as Record<string, unknown>
    return typeof j.access_token === 'string' ? j.access_token : null
  } catch {
    return null
  }
}

function toWindow(o: unknown): RealUsageWindow | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const util = Number(r.utilization)
  if (!Number.isFinite(util)) return null
  // `utilization` is already a 0-100 percentage. `resets_at` is an ISO-8601
  // string (or null); an older shape used a Unix-seconds number — handle both.
  let resetsAt = 0
  if (typeof r.resets_at === 'string') resetsAt = new Date(r.resets_at).getTime() || 0
  else if (typeof r.resets_at === 'number' && Number.isFinite(r.resets_at))
    resetsAt = r.resets_at < 1e12 ? r.resets_at * 1000 : r.resets_at
  return { utilization: util, resetsAt }
}

async function fetchUsage(accessToken: string): Promise<RealUsage | { status: number }> {
  const res = await fetch(CLAUDE_USAGE_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    signal: AbortSignal.timeout(5000)
  })
  if (!res.ok) return { status: res.status }
  const j = (await res.json()) as Record<string, unknown>
  const model = j.model as Record<string, unknown> | undefined
  return {
    fiveHour: toWindow(j.five_hour),
    sevenDay: toWindow(j.seven_day),
    sevenDaySonnet: toWindow(j.seven_day_sonnet),
    modelName:
      model && typeof model.display_name === 'string' ? (model.display_name as string) : null,
    fetchedAt: Date.now()
  }
}

ipcMain.handle(
  'claude:realUsage',
  async (
    _e,
    opts: { keychainService?: string; fallbackToken?: string | null; force?: boolean }
  ): Promise<RealUsage> => {
    const now = Date.now()
    if (!opts?.force && realUsageCache && realUsageCache.expiresAt > now)
      return realUsageCache.data
    const fail = (error: RealUsage['error']): RealUsage => {
      const data: RealUsage = {
        fiveHour: null,
        sevenDay: null,
        sevenDaySonnet: null,
        modelName: null,
        fetchedAt: now,
        error
      }
      realUsageCache = { expiresAt: now + 60_000, data }
      return data
    }

    const service = opts?.keychainService || 'Claude Code-credentials'
    let token = parseTokenBlob(await readKeychainBlob(service))
    if (!token.accessToken && opts?.fallbackToken) token = parseTokenBlob(opts.fallbackToken)
    if (!token.accessToken) return fail('no-token')

    try {
      let result = await fetchUsage(token.accessToken)
      if ('status' in result && result.status === 401 && token.refreshToken) {
        const fresh = await refreshAccessToken(token.refreshToken)
        if (fresh) result = await fetchUsage(fresh)
      }
      if ('status' in result) return fail(result.status === 401 ? 'auth-expired' : 'unavailable')
      realUsageCache = { expiresAt: now + 60_000, data: result }
      return result
    } catch {
      return fail('network')
    }
  }
)

// Pull the user-set "custom-title" out of a session's jsonl head — used by
// pane.ts to reflect a /rename'd title into the sidebar pane title without
// having to wait for the next xterm OSC repaint. Cached briefly so the renderer
// can poll at 0s/1s/3s after session lock without thrashing the disk.
const claudeTitleCache = new Map<string, { title: string | null; expiresAt: number }>()
ipcMain.handle('claude:sessionTitle', (_e, { cwd, sessionId }: { cwd?: string; sessionId?: string }) => {
  if (!cwd || !sessionId) return null
  const key = `${cwd}::${sessionId}`
  const cached = claudeTitleCache.get(key)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.title
  const file = join(claudeProjectsDir(), encodeClaudeCwd(cwd), sessionId + '.jsonl')
  if (!existsSync(file)) return null
  let title: string | null = null
  const text = readHead(file) + '\n' + readTail(file)
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let o: Record<string, unknown>
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.type === 'custom-title' && typeof o.customTitle === 'string') {
      title = o.customTitle.trim() || null
      // Don't break — a later /rename overrides an earlier one; take the last.
    }
  }
  claudeTitleCache.set(key, { title, expiresAt: now + 1500 })
  return title
})

// Derive a coarse Claude session state from the session JSONL tail:
//   'in-progress' — last turn is a user/tool message (Claude will respond) or an
//                   assistant turn still holding an unresolved tool_use;
//   'question'    — assistant turn ended on a question to the user;
//   'idle'        — assistant turn ended normally (waiting on the user).
ipcMain.handle(
  'claude:sessionStatus',
  (_e, { cwd, sessionId }: { cwd?: string; sessionId?: string }) => {
    if (!cwd || !sessionId) return null
    const file = join(claudeProjectsDir(), encodeClaudeCwd(cwd), sessionId + '.jsonl')
    if (!existsSync(file)) return null
    const lines = readTail(file)
      .split('\n')
      .filter((l) => l.trim())
    let last: Record<string, unknown> | null = null
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const o = JSON.parse(lines[i]) as Record<string, unknown>
        if (o.type === 'user' || o.type === 'assistant') {
          last = o
          break
        }
      } catch {
        // truncated/partial line at the tail boundary — skip
      }
    }
    if (!last) return 'idle'
    if (last.type === 'user') return 'in-progress'
    const msg = (last.message as Record<string, unknown>) ?? last
    const content = msg.content
    let hasToolUse = false
    let lastText = ''
    if (Array.isArray(content)) {
      for (const c of content as Record<string, unknown>[]) {
        if (c.type === 'tool_use') hasToolUse = true
        if (c.type === 'text' && typeof c.text === 'string') lastText = c.text
      }
    } else if (typeof content === 'string') {
      lastText = content
    }
    if (hasToolUse || msg.stop_reason === 'tool_use') return 'in-progress'
    if (lastText.trim().endsWith('?')) return 'question'
    return 'idle'
  }
)

ipcMain.handle(
  'claude:latestSession',
  (_e, { cwd, since }: { cwd?: string; since?: number }) => {
    if (!cwd) return null
    const dir = join(claudeProjectsDir(), encodeClaudeCwd(cwd))
    if (!existsSync(dir)) return null
    let best: { id: string; mtimeMs: number } | null = null
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue
        const m = statSync(join(dir, f)).mtimeMs
        if (typeof since === 'number' && m <= since) continue
        if (!best || m > best.mtimeMs) best = { id: f.replace(/\.jsonl$/, ''), mtimeMs: m }
      }
    } catch {
      return null
    }
    return best ? best.id : null
  }
)

// Read just the head of a file (session prompts/cwd live near the top).
function readHead(path: string, bytes = 16384): string {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(bytes)
    const n = readSync(fd, buf, 0, bytes, 0)
    return buf.toString('utf8', 0, n)
  } catch {
    return ''
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

// Read the last `bytes` of a file — Claude appends custom-title / last-prompt
// records near the end of each session jsonl, so the tail is where they live.
function readTail(path: string, bytes = 16384): string {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const size = statSync(path).size
    const start = Math.max(0, size - bytes)
    const len = size - start
    const buf = Buffer.alloc(len)
    const n = readSync(fd, buf, 0, len, start)
    return buf.toString('utf8', 0, n)
  } catch {
    return ''
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

// All Claude sessions across projects, newest first, with a short summary + cwd.
ipcMain.handle('claude:sessions', () => {
  const root = claudeProjectsDir()
  if (!existsSync(root)) return []
  const out: { id: string; cwd: string | null; summary: string; mtimeMs: number }[] = []
  let projDirs: string[] = []
  try {
    projDirs = readdirSync(root)
  } catch {
    return []
  }
  for (const proj of projDirs) {
    const dir = join(root, proj)
    let files: string[]
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const f of files) {
      const full = join(dir, f)
      let mtimeMs: number
      try {
        mtimeMs = statSync(full).mtimeMs
      } catch {
        continue
      }
      // Claude writes the /rename title (custom-title) near the file head and the
      // most recent prompt (last-prompt) typically near the tail — scan both
      // windows so we capture whichever is present without reading the whole file.
      let cwd: string | null = null
      let firstPrompt = ''
      let customTitle = ''
      let lastPrompt = ''
      const head = readHead(full)
      const tail = readTail(full)
      for (const line of (head + '\n' + tail).split('\n')) {
        if (!line.trim()) continue
        let o: Record<string, unknown>
        try {
          o = JSON.parse(line)
        } catch {
          continue
        }
        if (!cwd && typeof o.cwd === 'string') cwd = o.cwd
        if (o.type === 'custom-title' && typeof o.customTitle === 'string') customTitle = o.customTitle
        else if (o.type === 'last-prompt' && typeof o.lastPrompt === 'string') lastPrompt = o.lastPrompt
        else if (!firstPrompt && o.type === 'user' && o.message) {
          const c = (o.message as { content?: unknown }).content
          if (typeof c === 'string') firstPrompt = c
          else if (Array.isArray(c)) {
            const t = c.find((x) => x && typeof x === 'object' && (x as { type?: string }).type === 'text')
            if (t) firstPrompt = String((t as { text?: string }).text ?? '')
          }
        }
      }
      // priority: user-set title → last prompt → first prompt (noisy fallback)
      let summary = customTitle || lastPrompt || firstPrompt
      // strip system-reminder/command XML wrappers so the prompt reads cleanly
      summary = summary
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140)
      out.push({ id: f.replace(/\.jsonl$/, ''), cwd, summary, mtimeMs })
    }
  }
  out.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return out.slice(0, 300)
})

ipcMain.on('open-external', (_e, { url }: { url: string }) => {
  // only http(s) — never hand arbitrary schemes (file:, etc.) to the OS
  if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
})

function shq(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

// List sub-directories of a path (for the Cmd+P folder picker). Empty -> home.
ipcMain.handle('dir:list', (_e, { path }: { path?: string }) => {
  let dir = path && path.trim() ? path.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  try {
    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => ({ name: d.name, path: join(dir, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))
    const parent = join(dir, '..')
    return { path: dir, parent: parent === dir ? null : parent, dirs }
  } catch {
    return { path: dir, parent: null, dirs: [] }
  }
})

// List a directory's entries (files + folders) for the file explorer.
ipcMain.handle('fs:listEntries', (_e, { path }: { path?: string }) => {
  let dir = path && path.trim() ? path.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
      .map((d) => ({ name: d.name, path: join(dir, d.name), isDir: d.isDirectory() }))
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))
    return { path: dir, entries }
  } catch {
    return { path: dir, entries: [] }
  }
})

// Open a path in the user's IDE via their `ide` command (no terminal spawned).
ipcMain.on('ide:open', (_e, { path, ide }: { path: string; ide: string }) => {
  if (!path || !existsSync(path)) return
  const cmd = ide && ide.trim() ? ide.trim() : 'open'
  execFile('/bin/zsh', ['-lic', `${cmd} ${shq(path)}`], () => {})
})

// List Claude plan files under ~/.claude/plans.
ipcMain.handle('plans:list', () => {
  const dir = join(homedir(), '.claude', 'plans')
  try {
    return readdirSync(dir)
      .filter((f) => /\.(md|mdx|mdc)$/i.test(f))
      .sort()
      .map((f) => ({ name: f, path: join(dir, f) }))
  } catch {
    return []
  }
})

// Aggregate every plan markdown file across the given project paths (each
// project's <path>/docs/plans dir). Used by the Notebook "Plans" section. Returns
// newest-first; missing dirs are skipped.
ipcMain.handle('plans:scan', (_e, { paths }: { paths?: string[] }) => {
  const out: { project: string; name: string; path: string; mtime: number }[] = []
  const seen = new Set<string>()
  for (const p of paths ?? []) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    const dir = join(p, 'docs', 'plans')
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    const project = p.replace(/\/+$/, '').split('/').pop() || p
    for (const f of entries) {
      if (!/\.(md|mdx|mdc)$/i.test(f)) continue
      const full = join(dir, f)
      let mtime = 0
      try {
        mtime = statSync(full).mtimeMs
      } catch {
        // unreadable entry — still list it, just without a sort key
      }
      out.push({ project, name: f, path: full, mtime })
    }
  }
  out.sort((a, b) => b.mtime - a.mtime)
  return out
})

// Live watchers per plans directory; each fires `plans:changed` so the
// renderer can re-fetch without waiting on its 4-second polling loop.
const plansWatchers = new Map<string, FSWatcher>()
const plansBroadcastTimers = new Map<string, NodeJS.Timeout>()

function broadcastPlansChanged(plansDir: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('plans:changed', { plansDir })
    }
  }
}

// Live watchers per Claude project dir (~/.claude/projects/<encoded-cwd>). A
// change there means a session jsonl was written — most importantly a /rename's
// custom-title record — so we broadcast `claude:sessionsChanged` and the renderer
// re-reads the affected panes' titles immediately instead of waiting on its 4s
// poll. Keyed by cwd so the renderer can match only its own panes.
const claudeWatchers = new Map<string, FSWatcher>()
const claudeBroadcastTimers = new Map<string, NodeJS.Timeout>()

function broadcastClaudeSessionsChanged(cwd: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('claude:sessionsChanged', { cwd })
    }
  }
}

ipcMain.handle('claude:watchSessions', (_e, { cwd }: { cwd?: string }) => {
  if (!cwd) return false
  if (claudeWatchers.has(cwd)) return true
  const dir = join(claudeProjectsDir(), encodeClaudeCwd(cwd))
  try {
    const watcher = fsWatch(dir, { persistent: false }, () => {
      const prev = claudeBroadcastTimers.get(cwd)
      if (prev) clearTimeout(prev)
      const t = setTimeout(() => {
        claudeBroadcastTimers.delete(cwd)
        // Drop cached titles for this cwd so the renderer's re-read sees the
        // just-written custom-title rather than a stale (<=1.5s) cache entry.
        for (const key of [...claudeTitleCache.keys()]) {
          if (key.startsWith(cwd + '::')) claudeTitleCache.delete(key)
        }
        broadcastClaudeSessionsChanged(cwd)
      }, 120)
      claudeBroadcastTimers.set(cwd, t)
    })
    watcher.on('error', () => {
      watcher.close()
      claudeWatchers.delete(cwd)
    })
    claudeWatchers.set(cwd, watcher)
    return true
  } catch {
    return false
  }
})

function ensurePlansWatcher(plansDir: string): void {
  if (plansWatchers.has(plansDir)) return
  try {
    mkdirSync(plansDir, { recursive: true })
    const watcher = fsWatch(plansDir, { persistent: false }, () => {
      // Debounce: a single rename/create can fire 2+ events on macOS.
      const prev = plansBroadcastTimers.get(plansDir)
      if (prev) clearTimeout(prev)
      const t = setTimeout(() => {
        plansBroadcastTimers.delete(plansDir)
        broadcastPlansChanged(plansDir)
      }, 150)
      plansBroadcastTimers.set(plansDir, t)
    })
    watcher.on('error', () => {
      watcher.close()
      plansWatchers.delete(plansDir)
    })
    plansWatchers.set(plansDir, watcher)
  } catch {
    // ignore: the directory may not be creatable (read-only fs); we just skip live updates
  }
}

// Plan files for a terminal: <repo>/docs/plans entries that match
// "<branch>-<slug>--pane-<stableId>.<ext>" or "<branch>-<slug>-<sessionId>.<ext>".
// Files with neither owner tag are ignored — the sidebar only attributes plans
// to their producing session, matched on either the pane stableId or the Claude
// session id. Slashes in the branch are matched as dashes since filenames can't
// contain "/".
ipcMain.handle('plans:forBranch', async (_e, { cwd, branch }: { cwd?: string; branch?: string }) => {
  type PlanRow = {
    name: string
    path: string
    ownerStableId: string | null
    ownerSessionId: string | null
  }
  if (!cwd || !branch) return [] as PlanRow[]
  let dir = cwd.trim()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  const root = await run(gitBin(), ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (!root) return [] as PlanRow[]
  const plansDir = join(root.trim(), 'docs', 'plans')
  ensurePlansWatcher(plansDir)
  try {
    const rows: PlanRow[] = []
    for (const f of readdirSync(plansDir).sort()) {
      const parsed = parsePlanFilename(f, branch)
      if (!parsed || (!parsed.ownerStableId && !parsed.ownerSessionId)) continue
      rows.push({
        name: f,
        path: join(plansDir, f),
        ownerStableId: parsed.ownerStableId,
        ownerSessionId: parsed.ownerSessionId
      })
    }
    return rows
  } catch {
    return [] as PlanRow[]
  }
})

// Saved SQL queries for the Database tool: plain .sql files, namespaced per
// connection under <stateDir>/db-queries/<connId>/.
const dbqSlug = (s: string): string => s.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '')
function dbqDir(connId: string): string | null {
  const slug = dbqSlug(connId)
  return slug ? join(stateDir(), 'db-queries', slug) : null
}
function dbqSafe(name: string): string | null {
  const base = dbqSlug(name)
  if (!base) return null
  return base.endsWith('.sql') ? base : base + '.sql'
}
ipcMain.handle('dbq:list', (_e, { connId }: { connId: string }) => {
  const dir = dbqDir(connId)
  if (!dir) return [] as { name: string; path: string }[]
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => ({ name: f, path: join(dir, f) }))
  } catch {
    return [] as { name: string; path: string }[]
  }
})
ipcMain.handle('dbq:read', (_e, { connId, name }: { connId: string; name: string }) => {
  const dir = dbqDir(connId)
  const safe = dbqSafe(name)
  if (!dir || !safe) return ''
  try {
    return readFileSync(join(dir, safe), 'utf8')
  } catch {
    return ''
  }
})
ipcMain.handle('dbq:write', (_e, { connId, name, sql }: { connId: string; name: string; sql: string }) => {
  const dir = dbqDir(connId)
  const safe = dbqSafe(name)
  if (!dir || !safe) return false
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, safe), sql)
    return true
  } catch {
    return false
  }
})
ipcMain.handle('dbq:delete', (_e, { connId, name }: { connId: string; name: string }) => {
  const dir = dbqDir(connId)
  const safe = dbqSafe(name)
  if (!dir || !safe) return false
  try {
    rmSync(join(dir, safe), { force: true })
    return true
  } catch {
    return false
  }
})

// Self-update: rebuild the app from its source repo and swap the installed
// /Applications copy. The build runs here (app stays alive so the UI can show
// progress); the swap + relaunch runs as a fully detached process so it
// survives this app quitting.
ipcMain.handle(
  'deploy:build',
  async (_e, { repoPath, command }: { repoPath: string; command?: string }) => {
    const repo = repoPath?.trim()
    if (!repo || !existsSync(join(repo, 'package.json'))) {
      return { ok: false, error: 'Repo path is not a valid Crafterm checkout (no package.json).' }
    }
    const cmd = (command ?? '').trim() || 'run-crafterm-deploy'
    const log = join(stateDir(), 'deploy.log')
    return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      execFile(
        '/bin/zsh',
        ['-lic', `${cmd} > ${shq(log)} 2>&1`],
        { cwd: repo },
        (err) => {
          if (!err) return resolve({ ok: true })
          let tail = ''
          try {
            tail = readFileSync(log, 'utf8').slice(-1500)
          } catch {
            /* ignore */
          }
          resolve({ ok: false, error: tail || err.message })
        }
      )
    })
  }
)
// Kill every live PTY and wait for each one to ACTUALLY exit. This is the fix
// for the update-restart crash: if PTYs are killed inside `before-quit` and the
// handler returns immediately (while the Node environment then tears down),
// node-pty's exit callbacks race the teardown and abort() the process via an
// uncaught ThreadSafeFunction throw. Draining first — waiting for each onExit to
// fire and remove the pty from `ptys` — leaves nothing to fire during teardown.
// A child that ignores SIGHUP (e.g. a running claude/vim) is escalated to
// SIGKILL after 5s so quitting/updating can't hang. Used both by the in-app
// update flow and by `before-quit`, so EVERY quit path (Cmd+Q, the deploy
// script's `osascript quit`, …) drains safely.
async function drainPtys(): Promise<void> {
  const entries = [...ptys.values()]
  if (entries.length === 0) return
  await Promise.all(
    entries.map(
      (p) =>
        new Promise<void>((resolve) => {
          let done = false
          let timer: NodeJS.Timeout | undefined
          const finish = () => {
            if (done) return
            done = true
            clearTimeout(timer)
            resolve()
          }
          // onExit already removes the pty from `ptys`; we just await it here.
          try {
            p.onExit(finish)
          } catch {
            finish()
            return
          }
          timer = setTimeout(() => {
            try {
              p.kill('SIGKILL')
            } catch {
              /* already gone */
            }
            // Give the forced kill a brief moment to fire onExit, then resolve.
            setTimeout(finish, 250)
          }, 5000)
          try {
            p.kill()
          } catch {
            finish()
          }
        })
    )
  )
}
ipcMain.handle('deploy:killAllPtys', async () => {
  await drainPtys()
  return true
})
ipcMain.handle('deploy:swap', (_e, { repoPath }: { repoPath: string }) => {
  const repo = repoPath?.trim()
  if (!repo) return false
  const dest = `/Applications/${APP_NAME}.app`
  const log = join(stateDir(), 'deploy.log')
  // Sentinel so the relaunched instance shows the "loading sessions" overlay.
  try {
    writeFileSync(join(stateDir(), '.updating'), String(Date.now()))
  } catch {
    /* ignore */
  }
  const steps = [
    // wait for this app to actually quit before replacing its bundle
    `for i in $(seq 1 60); do pgrep -x ${shq(APP_NAME)} >/dev/null || break; sleep 0.3; done`,
    `APP_PATH="$(find ${shq(join(repo, 'dist'))} -maxdepth 2 -name ${shq(APP_NAME + '.app')} -type d 2>/dev/null | head -1)"`,
    `[ -n "$APP_PATH" ] || { echo "built app not found under dist/"; exit 1; }`,
    `rm -rf ${shq(dest)}`,
    `cp -R "$APP_PATH" ${shq(dest)}`,
    `open ${shq(dest)}`
  ].join(' && ')
  try {
    const fd = openSync(log, 'a')
    const child = spawn('/bin/zsh', ['-lic', steps], {
      cwd: repo,
      detached: true,
      stdio: ['ignore', fd, fd]
    })
    child.unref()
  } catch {
    return false
  }
  // Give the detached helper a moment to start its wait loop, then quit.
  setTimeout(() => app.quit(), 200)
  return true
})
// One-shot: did we just relaunch after an update? Consumes the sentinel.
ipcMain.handle('deploy:wasUpdating', () => {
  const flag = join(stateDir(), '.updating')
  if (!existsSync(flag)) return false
  try {
    rmSync(flag, { force: true })
  } catch {
    /* ignore */
  }
  return true
})

// Installed app version (from package.json via Electron).
ipcMain.handle('app:version', () => app.getVersion())

// Git state of the build this running app was packaged from. Written into the
// bundle by scripts/deploy.sh (out/build-info.json) at deploy time. Returns null
// in dev (unpackaged) or when the file is missing — callers then skip the
// "redeploy needed" comparison.
ipcMain.handle('app:buildInfo', () => {
  if (!app.isPackaged) return null
  try {
    const info = JSON.parse(readFileSync(join(__dirname, '../build-info.json'), 'utf8'))
    return {
      commit: typeof info.commit === 'string' ? info.commit : null,
      commitCount: typeof info.commitCount === 'number' ? info.commitCount : null
    }
  } catch {
    return null
  }
})

// Live git state of the source repo: current commit, commit count, and whether
// the working tree has uncommitted changes. Lets the renderer flag that the
// running build is behind the repo (redeploy needed). null on any failure.
ipcMain.handle('app:repoGit', async (_e, { repoPath }: { repoPath?: string }) => {
  const repo = repoPath?.trim()
  if (!repo || !existsSync(repo)) return null
  const git = gitBin()
  const commit = await run(git, ['-C', repo, 'rev-parse', 'HEAD'])
  if (!commit) return null
  const count = await run(git, ['-C', repo, 'rev-list', '--count', 'HEAD'])
  const status = await run(git, ['-C', repo, 'status', '--porcelain'])
  return {
    commit: commit.trim(),
    commitCount: count ? parseInt(count.trim(), 10) || 0 : 0,
    dirty: status !== null && status.trim().length > 0
  }
})

// Open a file in the user's Markdown app via their `markdown` (mdpp) command.
ipcMain.on('markdown:open', (_e, { path }: { path: string }) => {
  execFile('/bin/zsh', ['-lic', `markdown ${shq(path)}`], () => {})
})

// Find markdown files under `root` by walking the tree (works for dot-folders
// like ~/.claude, which Spotlight/mdfind does not index).
const MD_SKIP = new Set(['node_modules', '.git', '.Trash', '.cache'])
function walkMd(dir: string, acc: string[], limit: number): void {
  if (acc.length >= limit) return
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (acc.length >= limit) return
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) {
      if (!MD_SKIP.has(e.name)) walkMd(join(dir, e.name), acc, limit)
    } else if (/\.(md|mdx|mdc)$/i.test(e.name)) {
      acc.push(join(dir, e.name))
    }
  }
}

ipcMain.handle('md:findAll', (_e, { root }: { root?: string }) => {
  let dir = root && root.trim() ? root.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  if (!existsSync(dir)) dir = homedir()
  const paths: string[] = []
  walkMd(dir, paths, 8000)
  const files = paths.map((p) => ({ path: p, name: p.split('/').pop() || p }))
  return { root: dir, files }
})

// Read any markdown file (read-only viewer for the Cmd+O finder).
ipcMain.handle('fs:readMd', (_e, { path }: { path: string }) => {
  if (!/\.(md|mdx|mdc)$/i.test(path) || !existsSync(path)) return ''
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
})

// Read any text file (read-only viewer). Caps size and rejects binary content so
// the file viewer pane never tries to render a multi-megabyte blob or garbage.
ipcMain.handle('fs:readText', (_e, { path }: { path: string }) => {
  try {
    if (!existsSync(path)) return { ok: false, error: 'File not found.' }
    const buf = readFileSync(path)
    if (buf.length > 2_000_000) return { ok: false, error: 'File too large to preview.' }
    if (buf.includes(0)) return { ok: false, error: 'Binary file — cannot preview.' }
    return { ok: true, text: buf.toString('utf8') }
  } catch {
    return { ok: false, error: 'Failed to read file.' }
  }
})

ipcMain.handle('fs:writeMd', (_e, { path, content }: { path: string; content: string }) => {
  if (!/\.(md|mdx|mdc)$/i.test(path)) return false
  try {
    writeFileSync(path, content)
    return true
  } catch {
    return false
  }
})

function isFilePath(p: string): boolean {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

// Resolve a path clicked in the terminal to an existing file. Terminal output
// often prints paths relative to a directory that isn't the pane's exact cwd
// (e.g. "pkg/docs/x.md" while the cwd is already inside "pkg", which would
// otherwise resolve to "pkg/pkg/docs/x.md" and 404). Try the path against the
// cwd and each ancestor directory, returning the first one that exists.
ipcMain.handle('fs:resolveFile', (_e, { base, rel }: { base?: string; rel: string }) => {
  let target = (rel || '').trim()
  if (!target) return null
  if (target.startsWith('~')) target = join(homedir(), target.slice(1))
  if (target.startsWith('/')) return isFilePath(target) ? target : null
  target = target.replace(/^\.\//, '')
  const candidates: string[] = []
  let dir = base && base.trim() ? base.trim() : homedir()
  for (let i = 0; i < 12; i++) {
    candidates.push(join(dir, target))
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  candidates.push(join(homedir(), target))
  for (const c of candidates) if (isFilePath(c)) return c
  return null
})

// Recursively list files under a root (for the notebook "Link file" finder).
function walkFiles(
  dir: string,
  exclude: Set<string>,
  out: { path: string; name: string }[],
  cap: number
): void {
  if (out.length >= cap) return
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (out.length >= cap) return
    if (e.name.startsWith('.') || exclude.has(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walkFiles(full, exclude, out, cap)
    else if (e.isFile()) out.push({ path: full, name: e.name })
  }
}
ipcMain.handle('fs:findFiles', (_e, { root, exclude }: { root?: string; exclude?: string[] }) => {
  let dir = root && root.trim() ? root.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  if (!existsSync(dir)) return { root: dir, files: [] as { path: string; name: string }[] }
  const out: { path: string; name: string }[] = []
  walkFiles(dir, new Set(exclude ?? ['node_modules', '.git', 'dist', 'out']), out, 20000)
  return { root: dir, files: out }
})

// Read/write the user-configured todo-list.md (Improve Crafterm panel).
function resolveTodoPath(p?: string): string {
  let path = (p || '').trim()
  if (path.startsWith('~')) path = join(homedir(), path.slice(1))
  return path
}
ipcMain.handle('todo:read', (_e, { path }: { path?: string }) => {
  const file = resolveTodoPath(path)
  if (!file || !existsSync(file)) return null
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
})
ipcMain.handle('todo:write', (_e, { path, content }: { path?: string; content: string }) => {
  const file = resolveTodoPath(path)
  if (!file) return false
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    return true
  } catch {
    return false
  }
})

// List the user's zsh-defined commands (aliases + functions) for the palette.
ipcMain.handle('zsh:commands', async () => {
  const out = await new Promise<string>((resolve) => {
    execFile(
      '/bin/zsh',
      ['-ic', 'alias; echo "@@FUNCS@@"; print -rl -- ${(k)functions}'],
      { timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
      (_err, stdout) => resolve(stdout || '')
    )
  })
  const [aliasPart, funcPart = ''] = out.split('@@FUNCS@@')
  const cmds: { name: string; value: string }[] = []
  for (const line of aliasPart.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_.-]+)=(.*)$/)
    if (m) cmds.push({ name: m[1], value: m[2].replace(/^'(.*)'$/, '$1') })
  }
  for (const line of funcPart.split('\n')) {
    const n = line.trim()
    if (n && !n.startsWith('_') && /^[A-Za-z0-9_.-]+$/.test(n)) cmds.push({ name: n, value: '' })
  }
  const seen = new Set<string>()
  return cmds
    .filter((c) => (seen.has(c.name) ? false : seen.add(c.name)))
    .sort((a, b) => a.name.localeCompare(b.name))
})

// --- Notebook: a free-form folder/.md tree under <stateDir>/notebooks ---

const notebooksDir = (): string => join(stateDir(), 'notebooks')

// Resolve a relative notebook path safely inside the notebooks dir.
function nbResolve(rel: string): string | null {
  const base = notebooksDir()
  const p = join(base, rel || '')
  if (p !== base && !p.startsWith(base + '/')) return null
  return p
}

interface NbNode {
  name: string
  path: string
  kind: 'dir' | 'file'
  children?: NbNode[]
}
function nbTree(dir: string): NbNode[] {
  const base = notebooksDir()
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: NbNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = join(dir, e.name)
    const rel = full.slice(base.length + 1)
    if (e.isDirectory()) out.push({ name: e.name, path: rel, kind: 'dir', children: nbTree(full) })
    else if (/\.(md|mdx|mdc)$/i.test(e.name)) out.push({ name: e.name, path: rel, kind: 'file' })
  }
  out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
  return out
}

ipcMain.handle('notebook:tree', () => {
  try {
    mkdirSync(notebooksDir(), { recursive: true })
  } catch {
    /* ignore */
  }
  return nbTree(notebooksDir())
})
ipcMain.handle('notebook:read', (_e, { path }: { path: string }) => {
  const p = nbResolve(path)
  if (!p || !existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return ''
  }
})
ipcMain.on('notebook:write', (_e, { path, content }: { path: string; content: string }) => {
  const p = nbResolve(path)
  if (!p) return
  try {
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, content)
  } catch {
    /* ignore */
  }
})
ipcMain.handle('notebook:mkdir', (_e, { path }: { path: string }) => {
  const p = nbResolve(path)
  if (!p) return false
  try {
    mkdirSync(p, { recursive: true })
    return true
  } catch {
    return false
  }
})
ipcMain.handle('notebook:create', (_e, { path }: { path: string }) => {
  let rel = path
  if (!/\.(md|mdx|mdc)$/i.test(rel)) rel += '.md'
  const p = nbResolve(rel)
  if (!p) return false
  try {
    mkdirSync(dirname(p), { recursive: true })
    if (!existsSync(p)) writeFileSync(p, '')
    return true
  } catch {
    return false
  }
})
ipcMain.handle('notebook:rename', (_e, { path, name }: { path: string; name: string }) => {
  const p = nbResolve(path)
  if (!p || !existsSync(p)) return false
  const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
  const np = nbResolve(parent ? `${parent}/${name}` : name)
  if (!np) return false
  try {
    renameSync(p, np)
    return true
  } catch {
    return false
  }
})
// Move a note/folder into another folder (drag-drop). `destDir` is the target
// directory relative path ('' = notebooks root). Rejects collisions and moving a
// folder into itself or a descendant.
ipcMain.handle('notebook:move', (_e, { src, destDir }: { src: string; destDir: string }) => {
  const sp = nbResolve(src)
  if (!sp || !existsSync(sp)) return false
  const dDir = nbResolve(destDir)
  if (!dDir) return false
  if (dDir === sp || dDir.startsWith(sp + '/')) return false
  const name = src.includes('/') ? src.slice(src.lastIndexOf('/') + 1) : src
  const np = join(dDir, name)
  if (np === sp || existsSync(np)) return false
  try {
    mkdirSync(dDir, { recursive: true })
    renameSync(sp, np)
    return true
  } catch {
    return false
  }
})
ipcMain.on('notebook:reveal', (_e, { path }: { path: string }) => {
  const p = nbResolve(path)
  if (p && existsSync(p)) shell.showItemInFolder(p)
})
// Open a folder (e.g. a terminal's cwd) in the OS file manager.
ipcMain.on('shell:openPath', (_e, { path }: { path: string }) => {
  if (path && existsSync(path)) void shell.openPath(path)
})
// Reveal an absolute path in Finder (selects the file in its containing folder).
ipcMain.on('shell:revealPath', (_e, { path }: { path: string }) => {
  if (path && existsSync(path)) shell.showItemInFolder(path)
})
// Play a macOS system sound by name (e.g. "Glass") for notifications.
ipcMain.on('sound:play', (_e, { name }: { name: string }) => {
  if (!name) return
  const p = `/System/Library/Sounds/${name}.aiff`
  if (existsSync(p)) execFile('/usr/bin/afplay', [p], () => {})
})

// Bundled, per-event notification sounds. 'question' plays when a pane wants
// attention (e.g. Claude asks something), 'done' when a long command finishes.
const soundsDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'sounds') : join(__dirname, '../../resources/sounds')
const EVENT_SOUNDS: Record<string, string> = {
  question: 'question.wav',
  done: 'notification.aac'
}
ipcMain.on('sound:event', (_e, { event }: { event: string }) => {
  const file = EVENT_SOUNDS[event]
  if (!file) return
  const p = join(soundsDir(), file)
  if (existsSync(p)) execFile('/usr/bin/afplay', [p], () => {})
})
// Absolute path to the bundled iOS worktree helper script. The renderer types
// `bash "<path>" <subcommand>` into a pane (with IOSWT_* env from settings.iosDev),
// so a build's output streams live in the terminal.
const scriptsDir = (): string =>
  app.isPackaged ? join(process.resourcesPath, 'scripts') : join(__dirname, '../../resources/scripts')
ipcMain.handle('iosWorktree:scriptPath', () => join(scriptsDir(), 'ios-worktree.sh'))

// Build the IOSWT_* env from a project's iosConfig (empty fields auto-detect in
// the script). repoRoot is the owning project's path.
interface IosCfg {
  project?: string
  scheme?: string
  baseBundleId?: string
  displayPrefix?: string
  defaultSimulator?: string
  copyFiles?: string[]
  worktreesDir?: string
}
function iosEnv(cfg: IosCfg | undefined, repoRoot?: string): Record<string, string> {
  const e: Record<string, string> = {}
  if (repoRoot) e.IOSWT_REPO_ROOT = repoRoot
  if (cfg?.project) e.IOSWT_PROJECT = cfg.project
  if (cfg?.scheme) e.IOSWT_SCHEME = cfg.scheme
  if (cfg?.baseBundleId) e.IOSWT_BUNDLE_ID = cfg.baseBundleId
  if (cfg?.displayPrefix) e.IOSWT_DISPLAY_PREFIX = cfg.displayPrefix
  if (cfg?.defaultSimulator) e.IOSWT_SIMULATOR = cfg.defaultSimulator
  if (cfg?.worktreesDir) e.IOSWT_WORKTREES_DIR = cfg.worktreesDir
  if (cfg?.copyFiles?.length) e.IOSWT_COPY_FILES = cfg.copyFiles.join(':')
  return e
}

// Live status for the sidebar: enumerate a repo's worktrees and their variants'
// built/installed/running state. Returns null on failure (renderer keeps prior).
ipcMain.handle(
  'iosWorktree:report',
  (_e, { repoRoot, cfg }: { repoRoot: string; cfg?: IosCfg }) =>
    new Promise((resolve) => {
      const script = join(scriptsDir(), 'ios-worktree.sh')
      execFile(
        '/bin/bash',
        [script, 'report'],
        { cwd: repoRoot, env: { ...process.env, ...iosEnv(cfg, repoRoot) }, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return resolve(null)
          try {
            resolve(JSON.parse(stdout.toString()))
          } catch {
            resolve(null)
          }
        }
      )
    })
)

// Terminate a worktree's variant on the target simulator.
ipcMain.handle(
  'iosWorktree:stop',
  (_e, { worktreePath, cfg }: { worktreePath: string; cfg?: IosCfg }) =>
    new Promise((resolve) => {
      const script = join(scriptsDir(), 'ios-worktree.sh')
      execFile(
        '/bin/bash',
        [script, 'stop'],
        { cwd: worktreePath, env: { ...process.env, ...iosEnv(cfg, worktreePath) }, timeout: 30_000 },
        (err) => resolve(!err)
      )
    })
)
ipcMain.handle('notebook:delete', (_e, { path }: { path: string }) => {
  const p = nbResolve(path)
  if (!p || p === notebooksDir()) return false
  try {
    rmSync(p, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
})

// List git worktrees for the repo containing `cwd`.
ipcMain.handle('git:worktrees', async (_e, { cwd }: { cwd?: string }) => {
  let dir = cwd && cwd.trim() ? cwd.trim() : homedir()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  const git = gitBin()
  const root = await run(git, ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (!root) return { root: null, worktrees: [] }
  const out = await run(git, ['-C', dir, 'worktree', 'list', '--porcelain'])
  const worktrees: { path: string; branch: string | null }[] = []
  let cur: { path?: string; branch?: string | null } = {}
  for (const line of (out ?? '').split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9) }
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '')
    else if (line === 'detached') cur.branch = '(detached)'
    else if (line === '' && cur.path) {
      worktrees.push({ path: cur.path, branch: cur.branch ?? null })
      cur = {}
    }
  }
  if (cur.path) worktrees.push({ path: cur.path, branch: cur.branch ?? null })
  return { root: root.trim(), worktrees }
})

ipcMain.on(
  'notify',
  (_e, { title, body, paneId }: { title: string; body: string; paneId?: string }) => {
    if (!Notification.isSupported()) {
      console.warn('[notify] native notifications are not supported here')
      return
    }
    // When the app window is in the foreground the user is already looking at
    // it — show only the in-app card (the renderer surfaces that itself) and
    // skip the OS notification so it doesn't double-notify.
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) return
    try {
      const n = new Notification({ title, body, silent: false })
      n.on('click', () => {
        // bring the app/window forward and focus the pane that triggered it
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          mainWindow.show()
          mainWindow.focus()
        }
        app.focus({ steal: true })
        if (paneId) sendToRenderer('focus-pane', { id: paneId })
      })
      n.show()
    } catch (err) {
      console.error('[notify] failed to show notification:', err)
    }
  }
)

// Last-resort guard: a stray teardown error (e.g. a PTY firing onExit just as the
// window is destroyed) should be logged, not surfaced as a blocking dialog and
// not crash the app.
process.on('uncaughtException', (err) => {
  console.error('[main] uncaught exception:', err)
})

// Custom app menu so the bold macOS menu title shows the app name (the default
// dev bundle would otherwise read "Electron"). Standard roles keep copy/paste etc.
function buildAppMenu(): void {
  if (process.platform !== 'darwin') return
  // Cmd+W lives on a real menu accelerator so it fires even when an embedded
  // <webview> (browser pane) has focus, where renderer keydown never arrives.
  // Custom View submenu (no Reload / Force Reload — Cmd+R would otherwise blow
  // away every pane's state. Devtools and zoom stay so debugging still works.)
  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    viewMenu,
    {
      label: 'Pane',
      submenu: [
        {
          label: 'Close Pane',
          accelerator: 'CmdOrCtrl+W',
          // In a pop-out window Cmd+W closes that window; otherwise it closes
          // the active pane in the main window.
          click: (_item, win) => {
            if (win && win !== mainWindow) win.close()
            else sendToRenderer('menu:close-pane', null)
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' } // window close moves to Shift+W
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

app.whenReady().then(() => {
  // Packaged builds use the bundled .icns; set the dock icon manually in dev so
  // the app shows the Crafterm logo while running via `npm run dev`.
  if (!app.isPackaged && process.platform === 'darwin') {
    try {
      const iconPath = join(app.getAppPath(), 'resources/images/crafterm-logo.png')
      if (existsSync(iconPath)) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
    } catch {
      // ignore: dock icon is a dev-only nicety
    }
  }
  buildAppMenu()
  // Belt-and-suspenders against accidental Cmd+R reloads (in addition to the
  // custom View menu that omits the Reload role). Catches any stray reload
  // accelerator from devtools, webviews, or pop-out windows before it fires.
  app.on('web-contents-created', (_e, wc) => {
    wc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (!(input.control || input.meta)) return
      if (input.key.toLowerCase() === 'r') event.preventDefault()
    })
  })
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let didFlushState = false
app.on('before-quit', (e) => {
  quitting = true
  for (const w of plansWatchers.values()) {
    try {
      w.close()
    } catch {
      // ignore: watcher may already be closed
    }
  }
  plansWatchers.clear()
  for (const t of plansBroadcastTimers.values()) clearTimeout(t)
  plansBroadcastTimers.clear()
  // First pass: let the renderer persist its CURRENT (correct) tree before any
  // PTY is killed. Killing PTYs makes the renderer close panes, which would
  // otherwise overwrite the saved state with an empty tree — breaking restore.
  if (
    !didFlushState &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    e.preventDefault()
    mainWindow.webContents.send('app:quitting')
    setTimeout(() => {
      didFlushState = true
      app.quit()
    }, 200)
    return
  }
  // Second pass: drain every live PTY (kill + await its real exit) BEFORE the
  // Node environment tears down. Killing them inline and returning lets Electron
  // start teardown immediately; node-pty then fires exit callbacks into a
  // half-destroyed env and aborts the process. Draining first empties `ptys` so
  // nothing fires during the actual teardown. Re-entrant: once drained the map
  // is empty, so the final before-quit pass falls through and the quit proceeds.
  if (ptys.size > 0) {
    e.preventDefault()
    drainPtys().then(() => app.quit())
  }
})
