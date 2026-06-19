import { BrowserWindow } from 'electron'
import { handle, emit, Channel } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import {
  existsSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
  watch as fsWatch,
  type FSWatcher
} from 'fs'
import {
  newSummary,
  applyJsonlLine,
  type ClaudeUsageSummary
} from '@core/services/claude-usage.service'
import * as claudeAccount from '@core/services/claude-account.service'

// --- Claude session history (~/.claude/projects/<encoded-cwd>/<id>.jsonl) ---
// Claude encodes a project's cwd into the dir name by replacing "/" and "." with "-".
function encodeClaudeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}
const claudeProjectsDir = (): string => join(homedir(), '.claude', 'projects')

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

let claudeUsageCache: { expiresAt: number; data: ClaudeUsageSummary } | null = null
// Brief per-session title cache so the renderer can poll at 0s/1s/3s after a
// session locks without thrashing the disk.
const claudeTitleCache = new Map<string, { title: string | null; expiresAt: number }>()
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
      emit(win.webContents, Channel.Claude.SessionsChanged, { cwd })
    }
  }
}

// Claude usage + session bridge (claude:*). Token aggregation lives in
// services/claude-usage.service.ts; real (server-side) usage in
// services/claude-account.service.ts; the session-jsonl parsing is here.
export function registerClaudeIpc(): void {
  // Aggregate Claude token usage across every session under
  // `~/.claude/projects/**/*.jsonl` for three periods (today, this week, this
  // month) so the top status bar can show quota-style percentages. Cached for 30s.
  handle(Channel.Claude.UsageSummary, () => {
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
  // Pulls the SAME percentages the `/usage` command shows, straight from
  // Anthropic's `GET /api/oauth/usage` endpoint, using the OAuth token Claude Code
  // stores in the macOS keychain (or a user-provided fallback secret). Lives in
  // services/claude-account.service.ts.
  handle(Channel.Claude.RealUsage, (opts) => claudeAccount.realUsage(opts))

  // Pull the user-set "custom-title" out of a session's jsonl head — used by
  // pane.ts to reflect a /rename'd title into the sidebar pane title without
  // having to wait for the next xterm OSC repaint.
  handle(Channel.Claude.SessionTitle, ({ cwd, sessionId }) => {
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
  handle(Channel.Claude.SessionStatus, ({ cwd, sessionId }) => {
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
  })

  // Current permission mode of a Claude session ('plan' | 'default' | 'auto' |
  // 'acceptEdits' | null). Claude appends a {type:'permission-mode',
  // permissionMode} record to the session JSONL on every mode change, so the last
  // such record in the file is the live mode.
  handle(Channel.Claude.PermissionMode, ({ cwd, sessionId }) => {
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
  })

  handle(Channel.Claude.LatestSession, ({ cwd, since }) => {
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
  })

  // Recover a Claude session's working directory from its jsonl (each line carries
  // a `cwd` field). The encoded project-dir name is lossy, so we scan every project
  // dir for `<sessionId>.jsonl` and read the first line that has a cwd.
  handle(Channel.Claude.SessionCwd, ({ sessionId }) => {
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

  // All Claude sessions across projects, newest first, with a short summary + cwd.
  handle(Channel.Claude.Sessions, () => {
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

  handle(Channel.Claude.WatchSessions, ({ cwd }) => {
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
}
