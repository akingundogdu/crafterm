import { app, BrowserWindow, ipcMain, Notification, Menu, shell, nativeImage } from 'electron'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { loadScript } from './services/scripts'
import * as terminal from './services/terminal.manager'
import { setSecret, getSecret, deleteSecret, isSecretsAvailable } from './services/secrets.service'
import * as notebook from './services/notebook.service'
import * as fsService from './services/fs.service'
import * as git from './services/git.service'
import * as plansWatcher from './services/plans.watcher'
import { run, gitBin, paneCwd } from './services/exec'
import {
  newSummary,
  applyJsonlLine,
  type ClaudeUsageSummary
} from './services/claude-usage.service'
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

// PTY processes, output routing (`owners`), and pop-out window bookkeeping now
// live in services/terminal.manager.ts; index.ts reaches them via `terminal.*`.
// The single detached "Improve Crafterm" window, if open.
let improveWin: BrowserWindow | null = null
// Pane ids whose pop-out window is allowed to actually close (kill confirmed).
const allowClose = new Set<string>()

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

// --- PTY bridge: this is where "web" reaches the real shell, via the Node main
// process. The implementation lives in services/terminal.manager.ts; these thin
// handlers just wire the IPC channels to it. ---

ipcMain.handle(
  'pty:create',
  (e, opts: { cwd?: string; env?: Record<string, string>; shell?: string }) =>
    terminal.create(e.sender, opts)
)

// A pop-out window adopts an existing pane: its output now flows to that window.
ipcMain.on('pty:adopt', (e, { id }: { id: string }) => {
  terminal.adopt(id, e.sender)
})

ipcMain.on('pty:input', (_e, { id, data }: { id: string; data: string }) => {
  terminal.write(id, data)
})

ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  terminal.resize(id, cols, rows)
})

ipcMain.on('pty:kill', (_e, { id }: { id: string }) => {
  terminal.kill(id)
  procBuffers.delete(id)
})

// --- Background processes ("hidden shells"): a PTY that runs a one-shot command
// (e.g. an iOS build/run), keyed by the renderer-supplied stableId. Output is
// buffered in main so a view can attach later and replay it (the PTY lives
// independent of any view; closing a view never kills it). It reuses the same
// pty:data / pty:exit / pty:kill / pty:input channels, keyed by stableId. ---
const procBuffers = new Map<string, string>()
const PROC_BUFFER_CAP = 256 * 1024 // keep the last ~256KB of output for replay

ipcMain.handle(
  'proc:start',
  (
    e,
    opts: { stableId: string; command: string; cwd?: string; env?: Record<string, string> }
  ) => {
    const id = opts.stableId
    if (terminal.has(id)) return id // already running — don't double-spawn
    terminal.setOwner(id, e.sender)
    const shell = process.env.SHELL || '/bin/zsh'
    let cwd = opts.cwd || homedir()
    if (cwd.startsWith('~')) cwd = join(homedir(), cwd.slice(1))
    if (!existsSync(cwd)) cwd = homedir()
    const env = { ...process.env, ...(opts.env ?? {}), CRAFTERM_PANE_ID: id }
    procBuffers.set(id, '')
    const p = pty.spawn(shell, ['-lc', opts.command], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: env as { [key: string]: string }
    })
    p.onData((data) => {
      try {
        const prev = procBuffers.get(id) ?? ''
        const next = (prev + data).slice(-PROC_BUFFER_CAP)
        procBuffers.set(id, next)
        terminal.sendToOwner(id, 'pty:data', { id, data })
      } catch {
        /* renderer gone — never throw back into node-pty */
      }
    })
    p.onExit(({ exitCode }) => {
      try {
        terminal.sendToOwner(id, 'proc:exit', { id, code: exitCode })
      } catch {
        /* teardown race */
      }
      terminal.remove(id) // buffer is kept for replay until the process is dismissed
    })
    terminal.set(id, p)
    return id
  }
)

// Replay buffer for an attaching view (the output produced while nothing watched).
ipcMain.handle('proc:buffer', (_e, { id }: { id: string }) => procBuffers.get(id) ?? '')

// Re-route a background process's live stream to the window attaching a view.
ipcMain.on('proc:attach', (e, { id }: { id: string }) => {
  terminal.setOwner(id, e.sender)
})

// --- Pop-out windows: host a single pane's terminal in its own window ---

function createPopoutWindow(paneId: string, title?: string): void {
  const existing = terminal.getPopout(paneId)
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
  terminal.setPopout(paneId, win)
  // The native close button needs a running-process confirm (done in the
  // pop-out renderer). Intercept unless we're quitting or the kill is confirmed.
  win.on('close', (e) => {
    if (quitting || allowClose.has(paneId)) return
    e.preventDefault()
    if (!win.webContents.isDestroyed()) win.webContents.send('popout:confirm-close', { id: paneId })
  })
  win.on('closed', () => {
    terminal.deletePopout(paneId)
    allowClose.delete(paneId)
    terminal.deleteOwner(paneId)
  })
}

ipcMain.handle('popout:open', (_e, { paneId, title }: { paneId: string; title?: string }) => {
  createPopoutWindow(paneId, title)
})

// The pop-out renderer confirmed the kill: close its window and tell the main
// window to drop the pane (which kills the PTY).
ipcMain.on('popout:close-confirmed', (_e, { id }: { id: string }) => {
  allowClose.add(id)
  terminal.getPopout(id)?.close()
  terminal.sendToRenderer('popout:killed', { id })
})

ipcMain.on('popout:focus', (_e, { id }: { id: string }) => {
  const win = terminal.getPopout(id)
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
// the installed app's saved sessions/layout. Tests/E2E set CRAFTERM_STATE_DIR to a
// throwaway temp dir so they never touch the real ~/.crafterm (HR-5); the default
// is unchanged when the env var is absent.
const stateDir = (): string =>
  process.env.CRAFTERM_STATE_DIR ||
  join(homedir(), app.isPackaged ? '.crafterm' : '.crafterm-dev')
const statePath = (): string => join(stateDir(), 'crafterm-state.json')

// --- Last-command capture (zsh preexec) -------------------------------------
// A ZDOTDIR shim installs a `preexec` hook that records each command run in a
// pane to <stateDir>/last-cmd/<CRAFTERM_PANE_ID>. On restore the renderer
// pre-types it for raw (non-Claude) panes so the user can resume where they left
// off. Best-effort: if the shim fails to install, terminals still work normally.
const lastCmdDir = (): string => join(stateDir(), 'last-cmd')
const zdotDir = (): string => join(stateDir(), 'zdotdir')
let shellIntegrationReady = false

function readLastCommand(stableId: string): string | null {
  try {
    const f = join(lastCmdDir(), stableId)
    if (!existsSync(f)) return null
    const s = readFileSync(f, 'utf8').trim()
    // Drop multi-line commands: pre-typing one with embedded newlines would auto-
    // run every line but the last, defeating the type-but-don't-run safety intent.
    if (!s || s.includes('\n')) return null
    return s
  } catch {
    return null
  }
}

// Generate the ZDOTDIR shim. Each shim file sources the user's real rc (from
// $USER_ZDOTDIR, defaulting to $HOME) so aliases/PATH/prompt stay intact, then
// .zshrc appends our preexec hook and restores ZDOTDIR so nested shells are
// untouched. Every source is guarded with `[ -f ]` so an unusual zsh setup still
// yields a working shell.
function setupShellIntegration(): void {
  try {
    mkdirSync(lastCmdDir(), { recursive: true })
    const dir = zdotDir()
    mkdirSync(dir, { recursive: true })
    const templates = join(scriptsDir(), 'templates')
    // .zshenv runs for every shell. A user .zshenv may itself set ZDOTDIR, so the
    // shim snapshots the shim dir first and reasserts it afterwards (see template).
    writeFileSync(join(dir, '.zshenv'), loadScript(templates, 'claude-shim.zshenv.tmpl'))
    writeFileSync(join(dir, '.zprofile'), loadScript(templates, 'claude-shim.zprofile.tmpl'))
    const cmdDir = lastCmdDir().replace(/(["\\$`])/g, '\\$1')
    writeFileSync(join(dir, '.zshrc'), loadScript(templates, 'claude-shim.zshrc.tmpl', { cmdDir }))
    shellIntegrationReady = true
  } catch {
    shellIntegrationReady = false
  }
}
setupShellIntegration()

// Bumped when the persisted shape changes (kept in sync with the renderer's
// SCHEMA_VERSION in state.ts). State whose schemaVersion is below this is backed
// up once before the renderer migrates and overwrites it on the next save.
const SCHEMA_VERSION = 4

function backupStateBeforeMigration(raw: string): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    writeFileSync(join(stateDir(), `crafterm-state.backup-${ts}.json`), raw)
    // Keep only the most recent 5 backups.
    const dir = stateDir()
    const backups = readdirSync(dir)
      .filter((f) => f.startsWith('crafterm-state.backup-') && f.endsWith('.json'))
      .sort()
    for (const f of backups.slice(0, Math.max(0, backups.length - 5))) {
      try {
        unlinkSync(join(dir, f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore backup errors — never block startup */
  }
}

ipcMain.handle('store:load', () => {
  try {
    if (!existsSync(statePath())) return null
    const raw = readFileSync(statePath(), 'utf8')
    const data = JSON.parse(raw)
    if (data && typeof data === 'object' && data.schemaVersion !== SCHEMA_VERSION) {
      backupStateBeforeMigration(raw)
    }
    return data
  } catch {
    return null
  }
})

ipcMain.on('store:save', (_e, data: unknown) => {
  try {
    mkdirSync(stateDir(), { recursive: true })
    // Atomic write: a hard kill mid-write would otherwise leave a truncated JSON
    // that fails to parse on next launch, losing every saved session.
    const tmp = statePath() + '.tmp'
    writeFileSync(tmp, JSON.stringify(data, null, 2))
    renameSync(tmp, statePath())
  } catch {
    /* ignore write errors */
  }
})

// --- Pane info (cwd via lsof, git branch) + native notifications ---

ipcMain.handle('pane:info', async (_e, { id, stableId }: { id: string; stableId?: string }) => {
  const lastCommand = stableId ? readLastCommand(stableId) : null
  const p = terminal.get(id)
  if (!p) return { cwd: null, branch: null, worktree: null, lastCommand }
  const cwd = await paneCwd(p.pid)
  const [branch, worktree] = cwd
    ? await Promise.all([git.currentBranch(cwd), git.worktreeName(cwd)])
    : [null, null]
  return { cwd, branch, worktree, lastCommand }
})

// Local branches for the repo a pane is in, most-recently-committed first.
ipcMain.handle('git:branches', async (_e, { id }: { id: string }) => {
  const p = terminal.get(id)
  if (!p) return []
  const cwd = await paneCwd(p.pid)
  if (!cwd) return []
  return git.branches(cwd)
})

// List git stashes for the repo a pane is in: [{ ref: 'stash@{0}', description }].
ipcMain.handle('git:stashList', async (_e, { id }: { id: string }) => {
  const p = terminal.get(id)
  if (!p) return []
  const cwd = await paneCwd(p.pid)
  if (!cwd) return []
  return git.stashList(cwd)
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
// safeStorage-encrypted secrets live under <stateDir>/secrets; the operations
// are in services/secrets.service.ts. These handlers just resolve the base dir
// and delegate.
function secretsDir(): string {
  return join(stateDir(), 'secrets')
}
ipcMain.handle('secrets:set', (_e, { entryId, key, value }: { entryId: string; key: string; value: string }) =>
  setSecret(secretsDir(), entryId, key, value)
)
ipcMain.handle('secrets:get', (_e, { entryId, key }: { entryId: string; key: string }) =>
  getSecret(secretsDir(), entryId, key)
)
ipcMain.handle('secrets:delete', (_e, { entryId, key }: { entryId: string; key?: string }) =>
  deleteSecret(secretsDir(), entryId, key)
)
ipcMain.handle('secrets:available', () => isSecretsAvailable())

// Aggregate Claude token usage across every session under
// `~/.claude/projects/**/*.jsonl` for three periods (today, this week, this
// month) so the top status bar can show quota-style percentages. The "cap" used
// for percentages is configurable per-period (passed in from the renderer);
// without one we still return the raw totals. Cached for 30s.
let claudeUsageCache: { expiresAt: number; data: ClaudeUsageSummary } | null = null
ipcMain.handle('claude:usageSummary', () => {
  const now = Date.now()
  if (claudeUsageCache && claudeUsageCache.expiresAt > now) return claudeUsageCache.data
  const root = claudeProjectsDir()
  const { summary, bounds } = newSummary(new Date(now))
  const cache = (): ClaudeUsageSummary => {
    claudeUsageCache = { expiresAt: now + 30_000, data: summary }
    return summary
  }
  if (!existsSync(root)) return cache()
  let projDirs: string[] = []
  try {
    projDirs = readdirSync(root)
  } catch {
    return cache()
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
      if (mtimeMs < bounds.monthStart) continue
      // Read enough of the tail to capture this month's records on hot files.
      // For older monthly data the tail is fine; for very large weekly files we
      // may miss earliest entries — acceptable for a rolling indicator.
      const text = readTail(full, 256 * 1024)
      let touchedToday = false
      for (const line of text.split('\n')) {
        if (applyJsonlLine(summary, line, bounds)) touchedToday = true
      }
      if (touchedToday) summary.sessions++
    }
  }
  return cache()
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

// Current permission mode of a Claude session ('plan' | 'default' | 'auto' |
// 'acceptEdits' | null). Claude appends a {type:'permission-mode',
// permissionMode} record to the session JSONL on every mode change, so the last
// such record in the file is the live mode. We scan a generous tail (a single
// plan Write tool_use can be large) from the end for the most recent one.
ipcMain.handle(
  'claude:permissionMode',
  (_e, { cwd, sessionId }: { cwd?: string; sessionId?: string }) => {
    if (!cwd || !sessionId) return null
    const file = join(claudeProjectsDir(), encodeClaudeCwd(cwd), sessionId + '.jsonl')
    if (!existsSync(file)) return null
    const lines = readTail(file, 262144)
      .split('\n')
      .filter((l) => l.trim())
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const o = JSON.parse(lines[i]) as Record<string, unknown>
        if (o.type === 'permission-mode' && typeof o.permissionMode === 'string') {
          return o.permissionMode
        }
      } catch {
        // truncated/partial line at the tail boundary — skip
      }
    }
    return null
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

// Recover a Claude session's working directory from its jsonl (each line carries
// a `cwd` field). The encoded project-dir name is lossy, so we scan every project
// dir for `<sessionId>.jsonl` and read the first line that has a cwd. Used to
// resume a Claude pane whose saved cwd was lost.
ipcMain.handle('claude:sessionCwd', (_e, { sessionId }: { sessionId?: string }) => {
  if (!sessionId) return null
  const root = claudeProjectsDir()
  if (!existsSync(root)) return null
  try {
    for (const d of readdirSync(root)) {
      const file = join(root, d, sessionId + '.jsonl')
      if (!existsSync(file)) continue
      for (const line of readHead(file).split('\n')) {
        if (!line.trim()) continue
        try {
          const obj = JSON.parse(line) as { cwd?: unknown }
          if (typeof obj.cwd === 'string' && obj.cwd) return obj.cwd
        } catch {
          /* partial/non-JSON line — keep scanning */
        }
      }
      return null
    }
  } catch {
    return null
  }
  return null
})

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
ipcMain.handle('fs:listEntries', (_e, { path }: { path?: string }) => fsService.listEntries(path))

// Open a path in the user's IDE via their `ide` command (no terminal spawned).
ipcMain.on('ide:open', (_e, { path, ide }: { path: string; ide: string }) => {
  if (!path || !existsSync(path)) return
  const cmd = ide && ide.trim() ? ide.trim() : 'open'
  execFile('/bin/zsh', ['-lic', loadScript(join(scriptsDir(), 'templates'), 'ide-open.sh.tmpl', { cmd, path: shq(path) })], () => {})
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
// Plans-dir watchers (plans:changed broadcasts) live in services/plans.watcher.ts.

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

// Plan files for a terminal: <repo>/docs/plans entries that match
// "<branch>-<slug>--pane-<stableId>.<ext>" or "<branch>-<slug>-<sessionId>.<ext>".
// Files with neither owner tag are ignored — the sidebar only attributes plans
// to their producing session, matched on either the pane stableId or the Claude
// session id. Slashes in the branch are matched as dashes since filenames can't
// contain "/".
ipcMain.handle('plans:forBranch', async (_e, { cwd, branch }: { cwd?: string; branch?: string }) => {
  type PlanRow = {
    name: string
    slug: string
    path: string
    mtime: number
    ownerStableId: string | null
    ownerSessionId: string | null
  }
  if (!cwd || !branch) return [] as PlanRow[]
  let dir = cwd.trim()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  const root = await run(gitBin(), ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (!root) return [] as PlanRow[]
  const plansDir = join(root.trim(), 'docs', 'plans')
  plansWatcher.ensure(plansDir)
  try {
    const rows: PlanRow[] = []
    for (const f of readdirSync(plansDir).sort()) {
      const parsed = parsePlanFilename(f, branch)
      if (!parsed || (!parsed.ownerStableId && !parsed.ownerSessionId)) continue
      const full = join(plansDir, f)
      let mtime = 0
      try {
        mtime = statSync(full).mtimeMs
      } catch {
        // ignore — file vanished between readdir and stat
      }
      rows.push({
        name: f,
        slug: parsed.slug,
        path: full,
        mtime,
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
        ['-lic', loadScript(join(scriptsDir(), 'templates'), 'deploy-run.sh.tmpl', { cmd, log: shq(log) })],
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
ipcMain.handle('deploy:killAllPtys', async () => {
  await terminal.drain()
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
  const steps = loadScript(join(scriptsDir(), 'templates'), 'self-update.sh.tmpl', {
    appName: shq(APP_NAME),
    distDir: shq(join(repo, 'dist')),
    appBundle: shq(APP_NAME + '.app'),
    dest: shq(dest)
  })
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
  const gitPath = gitBin()
  const commit = await run(gitPath, ['-C', repo, 'rev-parse', 'HEAD'])
  if (!commit) return null
  const count = await run(gitPath, ['-C', repo, 'rev-list', '--count', 'HEAD'])
  const status = await run(gitPath, ['-C', repo, 'status', '--porcelain'])
  return {
    commit: commit.trim(),
    commitCount: count ? parseInt(count.trim(), 10) || 0 : 0,
    dirty: status !== null && status.trim().length > 0
  }
})

// Monotonic build counter: increments on every save under the source repo while
// the app is running. Stored per-repo in <stateDir>/build-counter.json and never
// reset — gives the version chip a "+N" that ticks up as code changes, surfacing
// edits without a commit or redeploy. The recursive watcher is started lazily on
// the first query and survives restarts via the persisted count.
const buildCounterWatchers = new Map<string, FSWatcher>()
const buildCounterTimers = new Map<string, NodeJS.Timeout>()
const buildCounterPath = (): string => join(stateDir(), 'build-counter.json')

function readBuildCounters(): Record<string, number> {
  try {
    const data = JSON.parse(readFileSync(buildCounterPath(), 'utf8'))
    if (!data || typeof data !== 'object') return {}
    return data as Record<string, number>
  } catch {
    return {}
  }
}

function writeBuildCounters(counters: Record<string, number>): void {
  try {
    mkdirSync(stateDir(), { recursive: true })
    writeFileSync(buildCounterPath(), JSON.stringify(counters))
  } catch {
    /* ignore */
  }
}

// Build output, dependencies, and git internals are not source edits, so changes
// under these path segments never bump the counter.
const BUILD_COUNTER_IGNORE = ['.git', 'node_modules', 'out', 'dist']
function isIgnoredBuildPath(file: string): boolean {
  return file.split(/[\\/]/).some((seg) => BUILD_COUNTER_IGNORE.includes(seg))
}

function ensureBuildCounterWatcher(repo: string): void {
  if (buildCounterWatchers.has(repo)) return
  try {
    const watcher = fsWatch(repo, { persistent: false, recursive: true }, (_evt, filename) => {
      if (filename && isIgnoredBuildPath(filename.toString())) return
      // Debounce: one save can fire several events; collapse to a single +1.
      const prev = buildCounterTimers.get(repo)
      if (prev) clearTimeout(prev)
      const t = setTimeout(() => {
        buildCounterTimers.delete(repo)
        const counters = readBuildCounters()
        counters[repo] = (counters[repo] ?? 0) + 1
        writeBuildCounters(counters)
      }, 300)
      buildCounterTimers.set(repo, t)
    })
    watcher.on('error', () => {
      watcher.close()
      buildCounterWatchers.delete(repo)
    })
    buildCounterWatchers.set(repo, watcher)
  } catch {
    /* ignore */
  }
}

// Current monotonic save count for the source repo; starts the watcher on first
// call so subsequent saves are counted. null when no/invalid repo path.
ipcMain.handle('app:buildCounter', (_e, { repoPath }: { repoPath?: string }) => {
  const repo = repoPath?.trim()
  if (!repo || !existsSync(repo)) return null
  ensureBuildCounterWatcher(repo)
  return readBuildCounters()[repo] ?? 0
})

// Open a file in the user's Markdown app via their `markdown` (mdpp) command.
ipcMain.on('markdown:open', (_e, { path }: { path: string }) => {
  execFile('/bin/zsh', ['-lic', loadScript(join(scriptsDir(), 'templates'), 'markdown-open.sh.tmpl', { path: shq(path) })], () => {})
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
ipcMain.handle('fs:readMd', (_e, { path }: { path: string }) => fsService.readMd(path))

// Read any text file (read-only viewer); caps size + rejects binary content.
ipcMain.handle('fs:readText', (_e, { path }: { path: string }) => fsService.readText(path))

ipcMain.handle('fs:writeMd', (_e, { path, content }: { path: string; content: string }) =>
  fsService.writeMd(path, content)
)

// Write any text file back to disk (code editor save). Only overwrites an
// existing regular file — never creates new paths here.
ipcMain.handle('fs:writeText', (_e, { path, content }: { path: string; content: string }) =>
  fsService.writeText(path, content)
)

// Read a monaco-themes theme JSON by display name (e.g. "Monokai"). Ships via
// extraResources when packaged; reads from node_modules in dev. Returns the
// parsed IStandaloneThemeData, or null on any failure / bad name.
const monacoThemesDir = (): string =>
  app.isPackaged
    ? join(process.resourcesPath, 'monaco-themes')
    : join(__dirname, '../../node_modules/monaco-themes/themes')
ipcMain.handle('monaco:theme', (_e, { name }: { name: string }) => {
  if (!name || name.includes('/') || name.includes('..')) return null
  try {
    const p = join(monacoThemesDir(), `${name}.json`)
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
})

// Resolve a relative import specifier to an absolute source file (go-to-
// definition for imports).
ipcMain.handle(
  'fs:resolveImport',
  (_e, { fromFile, spec, symbol }: { fromFile: string; spec: string; symbol?: string }) =>
    fsService.resolveImport(fromFile, spec, symbol)
)

// Create an empty file (Files tree → New File). Refuses to overwrite.
ipcMain.handle('fs:createFile', (_e, { path }: { path: string }) => fsService.createFile(path))

// Create a directory (Files tree → New Folder). Refuses an existing path.
ipcMain.handle('fs:mkdir', (_e, { path }: { path: string }) => fsService.mkdir(path))

// Rename/move a path (Files tree → Rename). Refuses if the destination exists.
ipcMain.handle('fs:rename', (_e, { from, to }: { from: string; to: string }) => fsService.rename(from, to))

// Move a path to the system Trash (Files tree → Delete). Recoverable, unlike rm.
ipcMain.handle('fs:trash', (_e, { path }: { path: string }) => fsService.trash(path))

// Git working-tree status for the Files tree decorations: map of absolute path →
// change kind, parsed from `git status --porcelain`.
ipcMain.handle('git:fileStatus', (_e, { cwd }: { cwd?: string }) => git.fileStatus(cwd))

// Resolve a path clicked in the terminal to an existing file (tries the cwd and
// each ancestor directory).
ipcMain.handle('fs:resolveFile', (_e, { base, rel }: { base?: string; rel: string }) =>
  fsService.resolveFile(base, rel)
)

// Recursively list files under a root (for the notebook "Link file" finder).
ipcMain.handle('fs:findFiles', (_e, { root, exclude }: { root?: string; exclude?: string[] }) =>
  fsService.findFiles(root, exclude)
)

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

// Read the project backlog (~/.crafterm/todo-list.json, shared by dev + prod) and
// return its items plus the resolved path so the renderer's spotlight can list
// backlog entries and open the file in the code editor without hardcoding a path.
ipcMain.handle('backlog:read', () => {
  const file = join(homedir(), '.crafterm', 'todo-list.json')
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const items = Array.isArray(parsed?.items)
      ? parsed.items
          .filter((it: unknown): it is { id: string; text: string; status?: string } => {
            const o = it as { id?: unknown; text?: unknown }
            return typeof o?.id === 'string' && typeof o?.text === 'string'
          })
          .map((it: { id: string; text: string; status?: string }) => ({
            id: it.id,
            text: it.text,
            status: typeof it.status === 'string' ? it.status : ''
          }))
      : []
    return { path: file, items }
  } catch {
    return null
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

// Notebook tree operations live in services/notebook.service.ts; these handlers
// resolve the base dir (<stateDir>/notebooks) and delegate.
ipcMain.handle('notebook:tree', () => {
  try {
    mkdirSync(notebooksDir(), { recursive: true })
  } catch {
    /* ignore */
  }
  return notebook.tree(notebooksDir())
})
ipcMain.handle('notebook:read', (_e, { path }: { path: string }) => notebook.read(notebooksDir(), path))
ipcMain.on('notebook:write', (_e, { path, content }: { path: string; content: string }) => {
  notebook.write(notebooksDir(), path, content)
})
ipcMain.handle('notebook:mkdir', (_e, { path }: { path: string }) => notebook.mkdir(notebooksDir(), path))
ipcMain.handle('notebook:create', (_e, { path }: { path: string }) => notebook.create(notebooksDir(), path))
ipcMain.handle('notebook:rename', (_e, { path, name }: { path: string; name: string }) =>
  notebook.rename(notebooksDir(), path, name)
)
ipcMain.handle('notebook:move', (_e, { src, destDir }: { src: string; destDir: string }) =>
  notebook.move(notebooksDir(), src, destDir)
)
ipcMain.on('notebook:reveal', (_e, { path }: { path: string }) => {
  const p = notebook.resolve(notebooksDir(), path)
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
// Function declaration (not a const arrow) so it is hoisted and callable from
// setupShellIntegration(), which runs at module init — before this line.
function scriptsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'scripts') : join(__dirname, '../../resources/scripts')
}
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
// Enumerate available iOS run targets: simulators (simctl JSON, reliable) and
// connected physical devices (xctrace text, best-effort). Returns names + UDIDs
// for the worktree "Build & Run" picker.
ipcMain.handle('ios:listTargets', async () => {
  const simulators: { name: string; udid: string }[] = []
  const devices: { name: string; udid: string }[] = []
  try {
    const out = await run('/usr/bin/xcrun', ['simctl', 'list', 'devices', 'available', '--json'])
    if (out) {
      const data = JSON.parse(out) as { devices: Record<string, { name: string; udid: string; isAvailable?: boolean }[]> }
      for (const [runtime, list] of Object.entries(data.devices)) {
        if (!/iOS/i.test(runtime)) continue
        for (const d of list) {
          if (d.isAvailable === false) continue
          simulators.push({ name: d.name, udid: d.udid })
        }
      }
    }
  } catch {
    /* simctl missing / parse error — leave simulators empty */
  }
  try {
    const out = await run('/usr/bin/xcrun', ['xctrace', 'list', 'devices'])
    if (out) {
      // Physical devices live under "== Devices ==" AND "== Devices Offline =="
      // (a USB device is often listed "offline" until trusted/tunneled — still
      // worth showing so the user can pick it). Lines look like
      // "Akın's iPhone (17.0) (00008110-...)". The host Mac carries no OS version
      // in parens, so the version-requiring regex excludes it; simulators live
      // under their own header.
      let inDevices = false
      for (const line of out.split('\n')) {
        const t = line.trim()
        if (/^==.*Devices.*==/i.test(t)) { inDevices = true; continue }
        if (/^==/.test(t)) { inDevices = false; continue }
        if (!inDevices || !t || /Simulator/i.test(t)) continue
        const m = t.match(/^(.*?)\s+\(([\d.]+)\)\s+\(([0-9A-Fa-f-]{8,})\)$/)
        if (m && !devices.some((d) => d.udid === m![3])) {
          devices.push({ name: `${m[1]} (${m[2]})`, udid: m[3] })
        }
      }
    }
  } catch {
    /* xctrace missing — leave devices empty */
  }
  return { simulators, devices }
})

// List the Xcode schemes for an iOS project (e.g. "local" / "prod" — they pick the
// API environment). Used by the worktree "Build & Run" picker's scheme level.
ipcMain.handle(
  'ios:listSchemes',
  (_e, { repoRoot, cfg }: { repoRoot: string; cfg?: IosCfg }) =>
    new Promise<string[]>((resolve) => {
      const args = ['xcodebuild', '-list', '-json']
      const container = cfg?.project?.trim()
      if (container) args.push(/\.xcworkspace$/.test(container) ? '-workspace' : '-project', container)
      execFile(
        '/usr/bin/xcrun',
        args,
        { cwd: repoRoot, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout) => {
          if (err) return resolve([])
          try {
            const d = JSON.parse(stdout.toString())
            const schemes = (d.workspace || d.project || {}).schemes
            resolve(Array.isArray(schemes) ? schemes : [])
          } catch {
            resolve([])
          }
        }
      )
    })
)

ipcMain.handle('notebook:delete', (_e, { path }: { path: string }) => notebook.del(notebooksDir(), path))

// List git worktrees for the repo containing `cwd`.
// Create a worktree at `path` for `branch`, awaiting completion (unlike the
// terminal-based newWorktree). Fetches the base from origin first so the new
// branch starts off the latest remote tip, then tries `-b` (new branch off
// origin/base) and finally falls back to attaching an existing branch. Used by
// "Run in worktree" (todo6).
ipcMain.handle(
  'git:worktreeAdd',
  (_e, { repo, path, branch, base }: { repo: string; path: string; branch: string; base?: string }) =>
    git.worktreeAdd(repo, path, branch, base)
)

ipcMain.handle('git:worktrees', (_e, { cwd }: { cwd?: string }) => git.listWorktrees(cwd))

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
        if (paneId) terminal.sendToRenderer('focus-pane', { id: paneId })
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
            else terminal.sendToRenderer('menu:close-pane', null)
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
  // Wire the terminal manager to index-owned state (main window + ZDOTDIR shim).
  terminal.init({
    getMainWindow: () => mainWindow,
    isShellIntegrationReady: () => shellIntegrationReady,
    getZdotDir: zdotDir
  })
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
  plansWatcher.closeAll()
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
  if (terminal.count() > 0) {
    e.preventDefault()
    terminal.drain().then(() => app.quit())
  }
})
