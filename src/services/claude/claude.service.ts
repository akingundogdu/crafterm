import { join } from 'path'
import { existsSync, readdirSync, statSync, watch as fsWatch, type FSWatcher } from 'fs'
import { newSummary, applyJsonlLine } from '@core/services/claude-usage/claude-usage.service'
import type { ClaudeUsageSummary } from '@core/services/claude-usage/claude-usage.types'
import * as claudeAccount from '@core/services/claude-account/claude-account.service'
import type { ClaudeRealUsageOptions, ClaudeSessionStatus } from './claude.types'
import {
  encodeClaudeCwd,
  claudeProjectsDir,
  readHead,
  readTail,
  broadcastClaudeSessionsChanged
} from './claude.utils'

// Claude usage + session domain logic (claude:*). Pure logic + per-session caches +
// live fs watchers — no IPC wiring (that lives in the ClaudeController adapter in
// claude.main.ts). Token aggregation lives in @core/services/claude-usage; real
// (server-side) usage in @core/services/claude-account; jsonl-read helpers in
// ./claude.utils.
export class ClaudeService {
  private usageCache: { expiresAt: number; data: ClaudeUsageSummary } | null = null
  // Brief per-session title cache so the renderer can poll at 0s/1s/3s after a
  // session locks without thrashing the disk.
  private readonly titleCache = new Map<string, { title: string | null; expiresAt: number }>()
  // Live watchers per Claude project dir (~/.claude/projects/<encoded-cwd>). A
  // change there means a session jsonl was written — most importantly a /rename's
  // custom-title record — so we broadcast `claude:sessionsChanged` and the renderer
  // re-reads the affected panes' titles immediately instead of waiting on its 4s
  // poll. Keyed by cwd so the renderer can match only its own panes.
  private readonly watchers = new Map<string, FSWatcher>()
  private readonly broadcastTimers = new Map<string, NodeJS.Timeout>()

  // Aggregate Claude token usage across every session under
  // `~/.claude/projects/**/*.jsonl` for three periods (today, this week, this
  // month) so the top status bar can show quota-style percentages. Cached for 30s.
  usageSummary(): ClaudeUsageSummary {
    const now = Date.now()
    if (this.usageCache && this.usageCache.expiresAt > now) return this.usageCache.data
    const root = claudeProjectsDir()
    const { summary, bounds } = newSummary(new Date(now))
    const cache = (): ClaudeUsageSummary => {
      this.usageCache = { expiresAt: now + 30_000, data: summary }
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
  }

  // Real ("server-side") Claude usage from Anthropic's GET /api/oauth/usage.
  realUsage(opts: ClaudeRealUsageOptions): ReturnType<typeof claudeAccount.realUsage> {
    return claudeAccount.realUsage(opts)
  }

  // Pull the user-set "custom-title" out of a session's jsonl — used to reflect a
  // /rename'd title into the sidebar pane title without waiting for an OSC repaint.
  sessionTitle(cwd: string, sessionId: string): string | null {
    if (!cwd || !sessionId) return null
    const key = `${cwd}::${sessionId}`
    const cached = this.titleCache.get(key)
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
    this.titleCache.set(key, { title, expiresAt: now + 1500 })
    return title
  }

  // Coarse Claude session state from the session JSONL tail: 'in-progress' (user/
  // tool turn or unresolved tool_use), 'question' (assistant ended on a '?'), or
  // 'idle' (assistant ended normally).
  sessionStatus(cwd: string, sessionId: string): ClaudeSessionStatus | null {
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

  // Current permission mode of a session ('plan'|'default'|'auto'|'acceptEdits'|null).
  // The last {type:'permission-mode'} record in the jsonl is the live mode.
  permissionMode(cwd: string, sessionId: string): string | null {
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

  // Newest session jsonl in a cwd's project dir, optionally only counting ones
  // modified after `since`. With `ofSession`, only that session itself or a
  // continuation of it qualifies: `claude --resume <id>` rolls the conversation
  // to a NEW session id whose jsonl head carries the resumed history (and thus
  // the old id) — matching on that keeps a same-cwd sibling pane's session from
  // being mistaken for this pane's.
  latestSession(cwd?: string, since?: number, ofSession?: string): string | null {
    if (!cwd) return null
    const dir = join(claudeProjectsDir(), encodeClaudeCwd(cwd))
    if (!existsSync(dir)) return null
    let best: { id: string; mtimeMs: number } | null = null
    try {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue
        const id = f.replace(/\.jsonl$/, '')
        const m = statSync(join(dir, f)).mtimeMs
        if (typeof since === 'number' && m <= since) continue
        if (best && m <= best.mtimeMs) continue
        if (ofSession && id !== ofSession && !readHead(join(dir, f)).includes(ofSession)) continue
        best = { id, mtimeMs: m }
      }
    } catch {
      return null
    }
    return best ? best.id : null
  }

  // Recover a session's working directory from its jsonl (each line carries a `cwd`).
  // The encoded project-dir name is lossy, so scan every project dir for the file.
  sessionCwd(sessionId: string): string | null {
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
  }

  // All Claude sessions across projects, newest first, with a short summary + cwd.
  sessions(): { id: string; cwd: string | null; summary: string; mtimeMs: number }[] {
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
  }

  watchSessions(cwd: string): boolean {
    if (!cwd) return false
    if (this.watchers.has(cwd)) return true
    const dir = join(claudeProjectsDir(), encodeClaudeCwd(cwd))
    try {
      const watcher = fsWatch(dir, { persistent: false }, () => {
        const prev = this.broadcastTimers.get(cwd)
        if (prev) clearTimeout(prev)
        const t = setTimeout(() => {
          this.broadcastTimers.delete(cwd)
          // Drop cached titles for this cwd so the renderer's re-read sees the
          // just-written custom-title rather than a stale (<=1.5s) cache entry.
          for (const key of [...this.titleCache.keys()]) {
            if (key.startsWith(cwd + '::')) this.titleCache.delete(key)
          }
          broadcastClaudeSessionsChanged(cwd)
        }, 120)
        this.broadcastTimers.set(cwd, t)
      })
      watcher.on('error', () => {
        watcher.close()
        this.watchers.delete(cwd)
      })
      this.watchers.set(cwd, watcher)
      return true
    } catch {
      return false
    }
  }

  // Close live fs watchers + pending broadcast timers on app quit.
  dispose(): void {
    for (const t of this.broadcastTimers.values()) clearTimeout(t)
    this.broadcastTimers.clear()
    for (const w of this.watchers.values()) {
      try {
        w.close()
      } catch {
        /* already closed */
      }
    }
    this.watchers.clear()
  }
}
