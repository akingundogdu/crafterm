import { app, BrowserWindow, ipcMain, Notification, Menu, shell, nativeImage } from 'electron'
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
  statSync,
  openSync,
  readSync,
  closeSync
} from 'fs'
import { execFile, spawn } from 'child_process'
import * as pty from 'node-pty'
import { registerDbIpc } from './db'

const APP_NAME = 'Crafterm'
// macOS uses this for the app menu / notification name; set it before whenReady.
app.setName(APP_NAME)

// Database tool: Postgres/MySQL/SQLite connect + query IPC (db:*).
registerDbIpc()

let mainWindow: BrowserWindow | null = null
let quitting = false

// One real PTY (zsh) per terminal pane, keyed by an id we hand back to the renderer.
const ptys = new Map<string, pty.IPty>()
// Which window currently receives a pane's output (main window, or a pop-out).
const owners = new Map<string, WebContents>()
// Open pop-out windows, keyed by the pane id they host.
const popouts = new Map<string, BrowserWindow>()
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
    const env = { ...process.env, ...(opts?.env ?? {}) }
    const p = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: env as { [key: string]: string }
    })

  p.onData((data) => sendToOwner(id, 'pty:data', { id, data }))
  p.onExit(() => {
    sendToOwner(id, 'pty:exit', { id })
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

// Newest session id for a cwd (the one an open Claude session is writing to).
ipcMain.handle('claude:latestSession', (_e, { cwd }: { cwd?: string }) => {
  if (!cwd) return null
  const dir = join(claudeProjectsDir(), encodeClaudeCwd(cwd))
  if (!existsSync(dir)) return null
  let best: { id: string; mtimeMs: number } | null = null
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue
      const m = statSync(join(dir, f)).mtimeMs
      if (!best || m > best.mtimeMs) best = { id: f.replace(/\.jsonl$/, ''), mtimeMs: m }
    }
  } catch {
    return null
  }
  return best ? best.id : null
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
      let cwd: string | null = null
      let summary = ''
      for (const line of readHead(full).split('\n')) {
        if (!line.trim()) continue
        let o: Record<string, unknown>
        try {
          o = JSON.parse(line)
        } catch {
          continue
        }
        if (!cwd && typeof o.cwd === 'string') cwd = o.cwd
        if (!summary && o.type === 'user' && o.message) {
          const c = (o.message as { content?: unknown }).content
          if (typeof c === 'string') summary = c
          else if (Array.isArray(c)) {
            const t = c.find((x) => x && typeof x === 'object' && (x as { type?: string }).type === 'text')
            if (t) summary = String((t as { text?: string }).text ?? '')
          }
        }
        if (cwd && summary) break
      }
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

// Plan files for a terminal: <repo>/docs/plans entries named "<branch>-*.md"
// (matching the "<git-branch-name>-<plan-slug>.md" convention). Slashes in the
// branch are also matched as dashes, since filenames can't contain "/".
ipcMain.handle('plans:forBranch', async (_e, { cwd, branch }: { cwd?: string; branch?: string }) => {
  if (!cwd || !branch) return [] as { name: string; path: string }[]
  let dir = cwd.trim()
  if (dir.startsWith('~')) dir = join(homedir(), dir.slice(1))
  const root = await run(gitBin(), ['-C', dir, 'rev-parse', '--show-toplevel'])
  if (!root) return []
  const plansDir = join(root.trim(), 'docs', 'plans')
  const prefixes = [branch + '-', branch.replace(/\//g, '-') + '-']
  try {
    return readdirSync(plansDir)
      .filter((f) => /\.(md|mdx|mdc)$/i.test(f) && prefixes.some((p) => f.startsWith(p)))
      .sort()
      .map((f) => ({ name: f, path: join(plansDir, f) }))
  } catch {
    return []
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
ipcMain.handle('deploy:build', async (_e, { repoPath }: { repoPath: string }) => {
  const repo = repoPath?.trim()
  if (!repo || !existsSync(join(repo, 'package.json'))) {
    return { ok: false, error: 'Repo path is not a valid Crafterm checkout (no package.json).' }
  }
  const log = join(stateDir(), 'deploy.log')
  return await new Promise<{ ok: boolean; error?: string }>((resolve) => {
    execFile(
      '/bin/zsh',
      ['-lic', `npm run build && npx electron-builder --dir > ${shq(log)} 2>&1`],
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
ipcMain.on('notebook:reveal', (_e, { path }: { path: string }) => {
  const p = nbResolve(path)
  if (p && existsSync(p)) shell.showItemInFolder(p)
})
// Open a folder (e.g. a terminal's cwd) in the OS file manager.
ipcMain.on('shell:openPath', (_e, { path }: { path: string }) => {
  if (path && existsSync(path)) void shell.openPath(path)
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
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
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
  for (const p of ptys.values()) {
    try {
      p.kill()
    } catch {
      /* ignore */
    }
  }
})
