import type { Pane, PaneStatus, NodeStatus } from '../types'
import { state, requestStatuses, pushNotification } from '../state'
import { persistence } from '../services/storage/persistence.service'
import { findTabByPane, ancestorFolders } from '../tree'
import { findProjectById } from '../catalog'
import { appService } from '../services/ipc'

// Does a typed command launch Claude? Matches the first word of each pipeline
// segment so `claude`, `claude-movve`, `code-foo && claude`, `run-…-claude` count,
// but not `echo claude`.
export function commandRunsClaude(cmd: string): boolean {
  return cmd.split(/&&|\|\||;|\|/).some((seg) => /claude/i.test(seg.trim().split(/\s+/)[0] || ''))
}

// A run shorter than this is an echo or a trivial command — not worth pinging about.
const LONG_RUN_MS = 3000

// Heuristic: does the recent terminal tail look like Claude is waiting on a
// yes/no or a choice? Used to re-tone a 'done' notification to 'question' when
// the pane is actually idle-waiting on the user, not actually finished.
const CLAUDE_QUESTION_PATTERNS: RegExp[] = [
  /do you want to/i,
  /would you like/i,
  /are you sure/i,
  /should i (?:continue|proceed|go ahead|run|stop|skip)/i,
  /(?:^|\n)\s*(?:1\.|2\.|❯).{0,80}(?:yes|no)\b/i,
  // Claude's interactive selection menu (AskUserQuestion / ExitPlanMode) renders
  // a `❯` cursor on the highlighted option, regardless of the option text — catch
  // it without the yes/no constraint above. The glyph is rare in normal output.
  /(?:^|\n)\s*❯\s+\S/,
  /press\s+(?:y|enter|any key|return)\b/i,
  /\(y\/n\)/i,
  /\?\s*$/m,
  /awaiting your reply/i,
  /confirm[:?]/i
]
export function looksLikeClaudeQuestion(tail: string): boolean {
  if (!tail) return false
  // Look only at the last ~1500 chars — older prompts shouldn't drive the
  // classification of a fresh idle event.
  const window = tail.slice(-1500)
  return CLAUDE_QUESTION_PATTERNS.some((re) => re.test(window))
}

export function markBusy(pane: Pane): void {
  pane.busy = true
  pane.lastActivity = Date.now() // terminal output counts as activity (idle detection)
  syncPaneStatus(pane)
  if (pane.idleTimer) clearTimeout(pane.idleTimer)
  pane.idleTimer = window.setTimeout(() => {
    pane.busy = false
    // The armed command (busySince set on Enter) went quiet for 700ms. If it ran
    // long enough, ping when the user is looking elsewhere, then disarm so we ping
    // once per command. While still under the threshold we keep waiting (a quiet
    // gap inside the command, e.g. `sleep`, must not disarm it).
    if (pane.busySince > 0 && Date.now() - pane.busySince >= LONG_RUN_MS) {
      // Claude panes: scan the recent buffer tail for question cues so a card
      // that's really waiting on user input shows up amber, not green.
      const event: 'question' | 'done' =
        pane.claude && looksLikeClaudeQuestion(pane.outputTail) ? 'question' : 'done'
      const body =
        event === 'question'
          ? `${pane.title || 'zsh'} is waiting for you`
          : `${pane.title || 'zsh'} finished`
      if (notifyPane(pane, body, event)) pane.attention = true
      pane.busySince = 0
    }
    syncPaneStatus(pane)
    requestStatuses()
  }, 700)
  requestStatuses()
}

export function paneStatus(p: Pane): PaneStatus {
  return p.attention ? 'attention' : p.busy ? 'running' : 'idle'
}

// Keep the persisted lifecycle status (NodeStatus on the stableId-keyed node) in
// sync with the live busy/claude signals. The visual sidebar dot still uses
// paneStatus()/claudeStatus; this is the durable status that round-trips through
// persistence. 'archived' is terminal — never auto-overwritten here.
export function syncPaneStatus(pane: Pane): void {
  if (pane.status === 'archived') return
  const next: NodeStatus =
    pane.claudeStatus === 'question'
      ? 'waiting'
      : pane.busy || pane.claudeStatus === 'in-progress'
        ? 'running'
        : 'idle'
  if (next !== pane.status) {
    pane.status = next
    persistence.save()
  }
}

// Native notification for a pane, but only when it's unattended (window blurred
// or a different pane active) and we haven't just pinged. `event` picks the
// sound: 'question' when the pane wants attention (bell), 'done' when a command
// finishes. Returns whether it fired.
function notifyPane(pane: Pane, body: string, event: 'question' | 'done'): boolean {
  const now = Date.now()
  const unattended = !document.hasFocus() || state.activePaneId !== pane.id
  if (!unattended || now - pane.lastNotify < 2000) return false
  pane.lastNotify = now
  appService.notify('Crafterm', body, pane.id) // paneId lets a click focus this pane
  appService.playEventSound(event)
  // Also drop a card in the right notification panel, tagged with its folder path
  // and the same git/cwd detail the sidebar shows when the terminal is pinned.
  const tab = findTabByPane(state.tree, pane.id)
  const trail = tab ? ancestorFolders(state.tree, tab.id) : null
  const group = trail && trail.length ? trail.map((f) => f.name).join(' / ') : ''
  const proj = pane.projectId ? findProjectById(state.tree, pane.projectId) : null
  pushNotification(pane.id, pane.title || 'zsh', group, body, {
    kind: 'pane',
    event,
    branch: pane.branch,
    worktree: pane.worktree,
    cwd: pane.cwd,
    projectColor: proj?.color ?? undefined
  })
  return true
}

export function onBell(pane: Pane): void {
  pane.attention = true
  notifyPane(pane, `${pane.title || 'zsh'} is ready`, 'question')
  requestStatuses()
}
