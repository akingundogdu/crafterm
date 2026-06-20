import type { Pane } from '@ui/types/types'
import { panes, state, paneActions, requestSidebar, requestStatuses } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { findTabByPane } from '@ui/tree/tree'
import { claudeService, terminalService, plansService , paneService } from '@services'
import { mirrorPaneTitleToTab } from './osc-title'
import { looksLikeClaudeQuestion, syncPaneStatus } from './activity-detection'
import { updatePaneStatus } from './status-bar'

// A plan belongs to a pane when its `--pane-<uuid>` tag matches the pane's
// stableId, or its trailing `-<sessionId>` matches the Claude session id this
// pane captured. The session-id match is what lets plans written by the
// SessionStart hook (which appends the Claude session id, not the pane id)
// attach to the pane that produced them.
export function isPlanOwnedByPane(
  plan: { ownerStableId: string | null; ownerSessionId: string | null },
  pane: Pane
): boolean {
  if (plan.ownerStableId && plan.ownerStableId === pane.stableId) return true
  if (plan.ownerSessionId && plan.ownerSessionId === pane.claudeSessionId) return true
  return false
}

export async function refreshPanePlans(pane: Pane): Promise<void> {
  const plans =
    pane.cwd && pane.branch ? await plansService.forBranch(pane.cwd, pane.branch) : []
  const sig = (
    a: { path: string; ownerStableId: string | null; ownerSessionId: string | null }[]
  ): string => a.map((x) => `${x.path}|${x.ownerStableId ?? ''}|${x.ownerSessionId ?? ''}`).join('§')
  if (sig(plans) !== sig(pane.plans)) {
    // Did this pane just gain its first owned plan? Auto-expand the tab's
    // details so the user sees the plan attach without having to click the
    // chevron. Skip when the user has already opened/closed details manually
    // and at least one owned plan exists — only flip on the empty→non-empty edge.
    const ownedNow = plans.filter((p) => isPlanOwnedByPane(p, pane)).length
    const ownedBefore = pane.plans.filter((p) => isPlanOwnedByPane(p, pane)).length
    // Plans this pane owns that weren't present on the previous sync — auto-open
    // each as a new markdown tab in this pane's group for review (plan mode).
    const prevOwned = new Set(
      pane.plans.filter((p) => isPlanOwnedByPane(p, pane)).map((p) => p.path)
    )
    const newlyOwned = plans.filter((p) => isPlanOwnedByPane(p, pane) && !prevOwned.has(p.path))
    pane.plans = plans
    if (ownedBefore === 0 && ownedNow > 0) {
      const tab = findTabByPane(state.tree, pane.id)
      if (tab && !tab.detailsOpen) tab.detailsOpen = true
    }
    // Skip the very first population so existing plans aren't opened on launch.
    // Then auto-open a plan only when BOTH hold: it was produced during this
    // live session (mtime newer than the pane's Claude launch) AND the session
    // is in plan mode right now (the JSONL's last permission-mode is 'plan').
    // Pre-existing plans that merely become "owned" when the session id is
    // captured (or when the in-memory list transiently empties on a branch/cwd
    // blip) have an older mtime; plans touched outside plan mode fail the mode
    // check. Either way they stay listed under the terminal node, not opened.
    if (pane.plansSynced) {
      const liveSince = pane.claudeSpawnedAt ?? Number.POSITIVE_INFINITY
      const fresh = newlyOwned.filter((p) => p.mtime >= liveSince)
      if (fresh.length && pane.claude && pane.cwd && pane.claudeSessionId) {
        const mode = await claudeService.permissionMode(pane.cwd, pane.claudeSessionId)
        if (mode === 'plan') {
          for (const plan of fresh) {
            // Auto-open disabled: plan stays listed under the terminal node
            // instead of opening in a group.
            // paneActions.openPlanInGroup(pane.id, plan.path)
            pane.planMode = true
          }
        }
      }
    }
    pane.plansSynced = true
    requestSidebar()
  }
}

// Poll the session JSONL for this Claude pane's coarse state (in-progress /
// question / idle) and reflect it on the sidebar when it changes.
export async function refreshClaudeStatus(pane: Pane): Promise<void> {
  if (!pane.claude || !pane.cwd || !pane.claudeSessionId) {
    if (pane.claudeStatus) {
      pane.claudeStatus = undefined
      requestSidebar()
    }
    return
  }
  try {
    const s = await claudeService.sessionStatus(pane.cwd, pane.claudeSessionId)
    let next = s ?? undefined
    // Reconcile the JSONL state with the terminal tail using the SAME question
    // heuristic the notification sound uses (looksLikeClaudeQuestion). The JSONL
    // tail can't tell "Claude is working" apart from "Claude is blocked on the
    // user" — an AskUserQuestion/ExitPlanMode tool_use or a permission prompt
    // both read as in-progress there. When the visible output is a prompt
    // awaiting the user, surface it as a question so the badge matches the sound.
    if (next === 'in-progress' && looksLikeClaudeQuestion(pane.outputTail)) {
      next = 'question'
    }
    if (next !== pane.claudeStatus) {
      pane.claudeStatus = next
      syncPaneStatus(pane)
      requestSidebar()
    }
  } catch {
    // best-effort — leave the previous status in place
  }
}

export async function applyClaudeSessionTitle(pane: Pane): Promise<void> {
  if (!pane.cwd || !pane.claudeSessionId || pane.titleLocked) return
  try {
    const title = await claudeService.sessionTitle(pane.cwd, pane.claudeSessionId)
    if (!title) return
    if (pane.title !== title) {
      pane.title = title
      pane.htitle.textContent = title
      mirrorPaneTitleToTab(pane)
      requestSidebar()
      persistence.save()
    }
  } catch {
    // ignore — best-effort title sync
  }
}

export async function refreshPaneInfo(pane: Pane): Promise<void> {
  const info = await paneService.info(pane.id, pane.stableId)
  // A null cwd means we couldn't read the pane (lsof timed out under heavy load,
  // or the pty is gone) — never overwrite a known-good cwd/branch/worktree with
  // it. Persisting an empty location is exactly what made every terminal reopen
  // at ~ after a hard kill. Keep the last good values and skip the change-save.
  let cwdChanged = false
  if (info.cwd !== null) {
    cwdChanged = info.cwd !== pane.cwd
    pane.cwd = info.cwd
    pane.branch = info.branch
    pane.worktree = info.worktree
  }
  if (info.lastCommand) pane.lastCommand = info.lastCommand
  updatePaneStatus(pane)
  // Plan files for this branch (docs/plans/<branch>-*.md). We fetch every tick
  // (cheap — main reads a single directory) so new files appear without
  // needing a cwd/branch change. The fs.watch broadcast covers the live case.
  await refreshPanePlans(pane)
  // For Claude panes, capture the session id this pane is writing to so restore
  // can `claude --resume <id>` the exact conversation that was open here. We
  // filter by `claudeSpawnedAt` so the id we pick is one that appeared after
  // this pane launched claude — never a sibling pane's session in the same cwd.
  // Once captured, we lock it so the periodic refresh never overwrites it with
  // whichever jsonl happens to be newest globally for the cwd.
  if (pane.claude && pane.cwd && !pane.claudeSessionLocked) {
    const since = pane.claudeSpawnedAt ?? 0
    const sid = await claudeService.latestSession(pane.cwd, since)
    if (sid) {
      if (sid !== pane.claudeSessionId) pane.claudeSessionId = sid
      pane.claudeSessionLocked = true
      persistence.save()
      // Pull the /rename custom-title immediately so the sidebar reflects it
      // without having to wait for the next xterm OSC repaint. Re-check at 1s
      // and 3s because Claude may write the title slightly after spawn.
      applyClaudeSessionTitle(pane)
      setTimeout(() => applyClaudeSessionTitle(pane), 1000)
      setTimeout(() => applyClaudeSessionTitle(pane), 3000)
    }
  } else if (pane.claude && pane.cwd && pane.claudeSessionId && !pane.titleLocked) {
    // Already locked: refresh in the background so /rename inside the session
    // updates the title without requiring a full pane restart.
    applyClaudeSessionTitle(pane)
  }
  // Ensure a live watcher on this session's project dir so /rename reflects
  // instantly (the watcher re-reads the title on jsonl change). Idempotent in
  // main, so calling every tick is cheap.
  if (pane.claude && pane.cwd && pane.claudeSessionId) {
    void claudeService.watchSessions(pane.cwd)
  }
  requestStatuses()
  if (cwdChanged) persistence.save() // persist the latest cwd so restore reopens here
}

// Sync the pane header's daily-task chip with pane.dailyTaskId. Called after an
// assignment changes (from dailyPlan.ts via paneActions).
export function refreshPaneDailyTask(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const chip = pane.el.querySelector<HTMLElement>('.pane-daily-chip')
  if (!chip) return
  // Only surface the chip when the terminal was opened from a ticket (the task
  // carries an issue key); plain assignments without a key stay hidden.
  const key = pane.dailyTaskId ? paneActions.dailyTaskIssueKey(pane.dailyTaskId) : null
  if (key) {
    chip.textContent = key
    chip.style.display = ''
  } else {
    chip.textContent = ''
    chip.style.display = 'none'
  }
}
