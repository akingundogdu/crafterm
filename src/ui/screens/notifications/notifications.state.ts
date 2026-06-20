import { panes, poppedOut, settings, pushNotification } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { selectPane, openLink, openNote, openMarkdownFile } from '@ui/commands/commands'
import { snoozeReminder } from '../reminders/reminders'
import { showDailyPlanModal } from '../daily-plan/daily-plan'
import { openMeetingNote } from '../meeting-notes/meeting-notes'
import { terminalService, claudeService, secretsService } from '@services'
import { fmtResetTime } from '@services/domain/usage'
import { bookmarkRepo, dailyTaskRepo, meetingNoteRepo, notificationRepo } from '@repositories'
import { pathTail } from './notif-format'
import { UITexts } from '@texts'
import type { AppNotification, ReminderPayload } from '@ui/types/types'
import type { RealUsage, UsageWindow, NotifChip, PayloadOpener } from './notifications.types'

// Down-chevron toggle on each card; rotates 180° via CSS when the card expands.
export const CHEVRON_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'

// Status icons shown left of the title. The icon (not a colour) communicates the
// notification state, since card colours now carry the project identity instead.
export const QUESTION_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
export const CLOCK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>'
export const CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

// Cards start collapsed (terminal name only); expanding reveals the message,
// source chips and remind button. Tracked per notification id for this session.
const expandedNotifs = new Set<string>()
export function isNotifExpanded(id: string): boolean {
  return expandedNotifs.has(id)
}
export function toggleNotifExpanded(id: string): void {
  if (expandedNotifs.has(id)) expandedNotifs.delete(id)
  else expandedNotifs.add(id)
}

// Removes a notification + forgets its expanded state (the view re-renders after).
export function removeNotif(id: string): void {
  notificationRepo.remove(id)
  expandedNotifs.delete(id)
}

// State-based accent: reminder (blue), question/attention (amber), done (green).
export function toneOf(n: AppNotification): string {
  return n.kind === 'reminder'
    ? 'reminder'
    : n.event === 'question'
      ? 'question'
      : n.event === 'done'
        ? 'done'
        : ''
}

export function statusIconFor(tone: string): string {
  return tone === 'question' ? QUESTION_SVG : tone === 'reminder' ? CLOCK_SVG : tone === 'done' ? CHECK_SVG : ''
}

// Source chips (project · branch · worktree · cwd) for a card's detail line.
export function buildNotifChips(n: AppNotification): NotifChip[] {
  const chips: NotifChip[] = []
  if (n.group) chips.push({ cls: 'project', text: n.group, title: n.group })
  if (n.branch) chips.push({ cls: 'branch', text: n.branch, title: 'branch: ' + n.branch })
  if (n.worktree && n.worktree !== n.branch) {
    chips.push({ cls: 'worktree', text: n.worktree, title: 'worktree: ' + n.worktree })
  }
  if (n.cwd) chips.push({ cls: 'cwd', text: pathTail(n.cwd), title: n.cwd })
  return chips
}

// ---- Claude usage chip logic ----------------------------------------------
// Resolve the OAuth token source from settings, then pull the real server-side
// utilization. The keychain (read in main) is the primary source; the fallback
// is a Crafterm secret whose value we decrypt here and pass along.
export async function fetchRealUsage(force: boolean): Promise<RealUsage> {
  const auth = settings.claudeUsageAuth
  let fallbackToken: string | null = null
  if (auth.fallbackSecretId && auth.fallbackSecretKey) {
    try {
      fallbackToken = await secretsService.get(auth.fallbackSecretId, auth.fallbackSecretKey)
    } catch {
      fallbackToken = null
    }
  }
  return claudeService.realUsage({
    keychainService: auth.keychainService,
    fallbackToken,
    force
  })
}

// Fire a notification card the first time session/week usage crosses each of
// 50/70/80/90/100% within a reset period. State persists so a crossing alerts
// once; it re-arms when the window's `resetsAt` advances.
const USAGE_THRESHOLDS = [50, 70, 80, 90, 100]
export function evaluateUsageThresholds(u: RealUsage): void {
  const check = (win: UsageWindow | null, state: { resetsAt: number; level: number }, label: string): void => {
    if (!win) return
    if (win.resetsAt !== state.resetsAt) {
      state.resetsAt = win.resetsAt
      state.level = 0
    }
    const pct = win.utilization
    const crossed = USAGE_THRESHOLDS.filter((t) => pct >= t && t > state.level)
    if (!crossed.length) return
    const top = crossed[crossed.length - 1]
    state.level = top
    pushNotification(
      '',
      `Claude ${label} usage ${top}%`,
      UITexts.Notifications.claudeUsageHeading,
      `${label} usage is at ${Math.round(pct)}% — resets ${fmtResetTime(win.resetsAt)}.`
    )
  }
  check(u.fiveHour, settings.claudeUsageNotify.session, 'session')
  check(u.sevenDay, settings.claudeUsageNotify.week, 'weekly')
  persistence.save()
}

// Resolve a reminder payload to a click action ("open this bookmark / pane /
// note"). Returns null when the target can no longer be found.
export function resolvePayloadOpener(payload: ReminderPayload | undefined): PayloadOpener | null {
  if (!payload) return null
  if (payload.kind === 'bookmark') {
    const bm = bookmarkRepo.get(payload.bookmarkId)
    if (!bm) return null
    return {
      label: bm.type === 'link' ? UITexts.Notifications.cardActions.open : UITexts.Notifications.cardActions.show,
      open: () => void openLink(bm.content)
    }
  }
  if (payload.kind === 'pane') {
    if (!panes.has(payload.paneId) && !poppedOut.has(payload.paneId)) return null
    return {
      label: UITexts.Notifications.cardActions.goToPane,
      open: () => {
        if (poppedOut.has(payload.paneId)) terminalService.popoutFocus(payload.paneId)
        else selectPane(payload.paneId)
      }
    }
  }
  if (payload.kind === 'notebook') {
    return {
      label: UITexts.Notifications.cardActions.openNote,
      open: () => void openNote(payload.path)
    }
  }
  if (payload.kind === 'dailyTask') {
    const t = dailyTaskRepo.get(payload.taskId)
    if (!t) return null
    return {
      label: UITexts.Notifications.cardActions.openTask,
      open: () => showDailyPlanModal(t.date, t.id)
    }
  }
  if (payload.kind === 'plan') {
    return {
      label: UITexts.Notifications.cardActions.openPlan,
      open: () => openMarkdownFile(payload.path)
    }
  }
  if (payload.kind === 'meetingNote') {
    const m = meetingNoteRepo.get(payload.noteId)
    if (!m) return null
    return {
      label: UITexts.Notifications.cardActions.openMeeting,
      open: () => openMeetingNote(m.id)
    }
  }
  return null
}

// ---- Card handler factories (R4) ------------------------------------------
export function makeDismissClick(id: string, dismiss: (id: string) => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    dismiss(id)
  }
}

export function makeChevronClick(id: string, rerender: () => void): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    toggleNotifExpanded(id)
    rerender()
  }
}

export function makeSnoozeChipClick(
  text: string,
  at: number,
  payload: ReminderPayload | undefined,
  notifId: string,
  dismiss: (id: string) => void
): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    snoozeReminder(text, at, payload)
    dismiss(notifId)
  }
}

export function makeOpenerClick(
  opener: PayloadOpener,
  id: string,
  dismiss: (id: string) => void
): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    opener.open()
    dismiss(id)
  }
}

export function makeReminderCardClick(opener: PayloadOpener, id: string, dismiss: (id: string) => void): () => void {
  return () => {
    opener.open()
    dismiss(id)
  }
}

export function makePaneCardClick(n: AppNotification, dismiss: (id: string) => void): () => void {
  return () => {
    // Jump to the pane (focus its pop-out window when popped out), then dismiss.
    if (poppedOut.has(n.paneId)) terminalService.popoutFocus(n.paneId)
    else if (panes.has(n.paneId)) selectPane(n.paneId)
    dismiss(n.id)
  }
}

export function makePaneRemindChipClick(
  n: AppNotification,
  at: number,
  closePopover: () => void,
  dismiss: (id: string) => void
): (e: MouseEvent) => void {
  return (e) => {
    e.stopPropagation()
    snoozeReminder(n.title || n.message, at, { kind: 'pane', paneId: n.paneId })
    closePopover()
    dismiss(n.id)
  }
}
