import { state, panes } from '@ui/state/state'
import { allTabs, panesInLayout, ancestorFolders } from '@ui/tree/tree'
import { paneStatus } from '@ui/pane/pane'
import { selectPane, openTerminalRunning, resumeClaudeSession } from '@ui/commands/commands'
import { claudeService, zshService } from '@services'
import type { ClaudeSession, ClaudeAccount } from './claude.types'

// ---- Sessions dashboard ----------------------------------------------------
// Walks every tab/pane and collects the ones running Claude.
export function collectSessions(): ClaudeSession[] {
  const sessions: ClaudeSession[] = []
  for (const tab of allTabs(state.tree)) {
    const trail = ancestorFolders(state.tree, tab.id)
    const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
    for (const pid of panesInLayout(tab.root)) {
      const p = panes.get(pid)
      if (p?.claude) {
        sessions.push({ paneId: pid, title: tab.title, group, status: paneStatus(p), cwd: p.cwd, branch: p.branch })
      }
    }
  }
  return sessions
}

export function filterSessions(sessions: ClaudeSession[], query: string): ClaudeSession[] {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  return sessions.filter((s) =>
    `${s.title} ${s.group} ${s.branch ?? ''} ${s.cwd ?? ''}`.toLowerCase().includes(q)
  )
}

// Row handler: jump to the session's pane, then tear the dashboard down.
export function makeSessionRowClick(paneId: string, done: () => void): () => void {
  return () => {
    selectPane(paneId)
    done()
  }
}

// ---- Account switcher ------------------------------------------------------
// Discovers any `claude-switch-<name>` alias/function in the user's zsh config.
export async function loadAccounts(): Promise<ClaudeAccount[]> {
  const cmds = await zshService.commands()
  return cmds
    .filter((c) => /^claude-switch-/.test(c.name))
    .map((c) => ({ name: c.name, label: c.name.replace(/^claude-switch-/, ''), value: c.value }))
}

export function filterAccounts(accounts: ClaudeAccount[], query: string): ClaudeAccount[] {
  const q = query.trim().toLowerCase()
  return accounts.filter((a) => !q || `${a.label} ${a.value ?? ''}`.toLowerCase().includes(q))
}

// Row handler: run the switch command in a new terminal, then close.
export function makeAccountRowClick(name: string, label: string, close: () => void): () => void {
  return () => {
    void openTerminalRunning(name, `Claude: ${label}`)
    close()
  }
}

// ---- Session resume --------------------------------------------------------
export type ResumeSession = Awaited<ReturnType<typeof claudeService.sessions>>[number]

export function loadResumeSessions(): Promise<ResumeSession[]> {
  return claudeService.sessions()
}

export function relTime(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function shortCwd(c: string | null): string {
  return c ? c.replace(/^\/(Users|home)\/[^/]+/, '~') : '(unknown dir)'
}

export function titleFor(s: ResumeSession): string {
  const base = s.cwd ? s.cwd.replace(/\/+$/, '').split('/').pop() || 'claude' : 'claude'
  return `↺ ${base}`
}

export function filterResumeSessions(sessions: ResumeSession[], query: string): ResumeSession[] {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  return sessions.filter((s) => (s.summary + ' ' + (s.cwd ?? '')).toLowerCase().includes(q))
}

// Resume the chosen history session in a new terminal, then close.
export function resumeSession(s: ResumeSession, close: () => void): void {
  void resumeClaudeSession(s.id, s.cwd, titleFor(s))
  close()
}
