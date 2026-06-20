import { BrowserWindow } from 'electron'
import { emit, Channel } from '@services/channels.main'
import { join } from 'path'
import { homedir } from 'os'
import { statSync, openSync, readSync, closeSync } from 'fs'

// Claude encodes a project's cwd into the dir name by replacing "/" and "." with "-".
export function encodeClaudeCwd(cwd: string): string {
  return cwd.replace(/[/.]/g, '-')
}

export const claudeProjectsDir = (): string => join(homedir(), '.claude', 'projects')

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

export function broadcastClaudeSessionsChanged(cwd: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      emit(win.webContents, Channel.Claude.SessionsChanged, { cwd })
    }
  }
}
