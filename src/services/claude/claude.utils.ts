import { BrowserWindow } from 'electron'
import { emit, Channel } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import { statSync, openSync, readSync, closeSync, readdirSync } from 'fs'

// Claude encodes a project's cwd into the dir name by replacing "/" and "." with "-".
export function encodeClaudeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

// `~/.claude/projects` by default. `CRAFTERM_CLAUDE_DIR` overrides the root for
// test isolation (mirrors the CRAFTERM_STATE_DIR hook) so e2e never reads or
// writes the user's real Claude session data.
export const claudeProjectsDir = (): string =>
  process.env.CRAFTERM_CLAUDE_DIR || join(homedir(), '.claude', 'projects')

// Read just the head of a file (session prompts/cwd live near the top).
export function readHead(path: string, bytes = 16384): string {
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
export function readTail(path: string, bytes = 16384): string {
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

const LIST_ITEM = /^\s*(?:\d+[.)]|[-*+])\s/
const TRAILING_MARKUP = /[*_`\s]+$/

const endsOnQuestionMark = (line: string): boolean => line.replace(TRAILING_MARKUP, '').endsWith('?')

// Does Claude's final text hand the turn back with a question? Either the text
// itself ends on a '?', or it ends on an options list whose lead-in line does
// ("How should we proceed?" followed by "1. … 2. …"). Trailing markdown emphasis
// (`**…?**`) is ignored.
export function endsWithQuestion(text: string): boolean {
  if (endsOnQuestionMark(text)) return true
  const lines = text.split('\n')
  let hasList = false
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.trim()) continue
    // A list item, or an indented continuation / nested line of one.
    if (LIST_ITEM.test(line) || /^\s/.test(line)) {
      hasList ||= LIST_ITEM.test(line)
      continue
    }
    return hasList && endsOnQuestionMark(line)
  }
  return false
}

// The pane files in the waiting dir (name -> mtimeMs). Hidden files (.DS_Store)
// are not panes; an entry removed mid-scan is skipped.
export function scanWaitingDir(dir: string): Map<string, number> {
  const out = new Map<string, number>()
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    if (name.startsWith('.')) continue
    try {
      out.set(name, statSync(join(dir, name)).mtimeMs)
    } catch {
      // removed between readdir and stat
    }
  }
  return out
}

export function broadcastClaudeWaitingChanged(paneStableId: string, isWaiting: boolean): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      emit(win.webContents, Channel.Claude.WaitingChanged, { paneStableId, isWaiting })
    }
  }
}

export function broadcastClaudeSessionsChanged(cwd: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      emit(win.webContents, Channel.Claude.SessionsChanged, { cwd })
    }
  }
}
