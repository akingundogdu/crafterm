import './notifications.css'
import { notifState, panes, poppedOut, settings, pushNotification } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { selectPane, openLink, openNote, openMarkdownFile } from '@ui/commands/commands'
import {
  renderReminders,
  openReminderForm,
  startReminderTimer,
  snoozeReminder,
  snoozeOptions
} from '../reminders/reminders'
import { renderExplorer, initExplorer } from '../explorer/explorer'
import { prTabVisible } from '../pr/pr'
import { renderBookmarks } from '../bookmarks/bookmarks'
import { showDailyPlanModal } from '../daily-plan/daily-plan'
import { openMeetingNote } from '../meeting-notes/meeting-notes'
import { renderTime, initTime, startAutoTracker } from '../time/time'
import { runUpdate } from '../pickers/update/update'
import { terminalService, claudeService, secretsService, appService } from '@services'
import { fmtResetTime, usageErrorShort, usageErrorLong } from '@services/domain/usage'
import { bookmarkRepo, dailyTaskRepo, meetingNoteRepo, notificationRepo } from '@repositories'
import { relTime, pathTail, shortModel } from './notif-format'
import { UITexts } from '@texts'

const appEl = document.getElementById('app')!
const listEl = document.getElementById('notif-list')!
const panelEl = document.getElementById('notif-panel')!

// Down-chevron toggle on each card; rotates 180° via CSS when the card expands.
const CHEVRON_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'

// Status icons shown left of the title. The icon (not a colour) communicates the
// notification state, since card colours now carry the project identity instead.
const QUESTION_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
const CLOCK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>'
const CHECK_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'

// Cards start collapsed (terminal name only); expanding reveals the message,
// source chips and remind button. Tracked per notification id for this session.
const expandedNotifs = new Set<string>()

export function applyNotifSize(): void {
  panelEl.style.width = settings.notifPanelSize + 'px'
}

// Drag the left edge of the right panel to resize it (mirror of the sidebar).
function wireNotifResizer(): void {
  const rz = document.getElementById('notif-resizer')!
  rz.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const onMove = (ev: MouseEvent): void => {
      const right = panelEl.getBoundingClientRect().right
      settings.notifPanelSize = Math.max(200, Math.min(640, right - ev.clientX))
      applyNotifSize()
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      persistence.save()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  })
}

export function applyNotifPanel(): void {
  appEl.classList.toggle('notif-open', notifState.open)
  updateBadge()
}

// Unread count on the bell icon (shown while the panel is closed).
function updateBadge(): void {
  const badge = document.getElementById('notif-badge')
  if (!badge) return
  const n = notificationRepo.getAll().length
  badge.textContent = n > 99 ? '99+' : String(n)
  badge.style.display = n > 0 ? 'flex' : 'none'
}

export function toggleNotifPanel(): void {
  notifState.open = !notifState.open
  applyNotifPanel()
  if (notifState.open) renderNotifications()
}

// Status bar Claude usage chip: polls every 30s. Compact display shows the
// active model + this-week percentage; clicking opens a popover with full
// today / week / month progress bars (mirrors Claude's /usage TUI).
type RealUsage = Awaited<ReturnType<typeof claudeService.realUsage>>
type UsageWindow = NonNullable<RealUsage['fiveHour']>

// Resolve the OAuth token source from settings, then pull the real server-side
// utilization. The keychain (read in main) is the primary source; the fallback
// is a Crafterm secret whose value we decrypt here and pass along.
async function fetchRealUsage(force: boolean): Promise<RealUsage> {
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

function initStatusbarUsage(): void {
  const chip = document.getElementById('statusbar-claude-usage')
  if (!chip) return
  const textEl = chip.querySelector('.usage-text') as HTMLElement | null
  const refreshBtn = document.getElementById('statusbar-usage-refresh')

  let lastUsage: RealUsage | null = null

  const refresh = async (force = false): Promise<void> => {
    refreshBtn?.classList.add('spinning')
    try {
      const u = await fetchRealUsage(force)
      lastUsage = u
      const week = u.sevenDay ? Math.round(u.sevenDay.utilization) : null
      const model = shortModel(u.modelName) || settings.claudePlanCaps.effort
      const parts: string[] = [model]
      if (u.error) parts.push(usageErrorShort(u.error))
      else if (week !== null) parts.push(`${week}% wk`)
      if (textEl) textEl.textContent = parts.join(' · ')
      chip.title = u.error ? usageErrorLong(u.error) : 'Click for session / week usage'
      evaluateUsageThresholds(u)
      const open = document.querySelector('.usage-popover')
      if (open) renderUsagePopover(open as HTMLElement, u)
    } catch {
      // ignore — chip keeps its last value
    } finally {
      refreshBtn?.classList.remove('spinning')
    }
  }
  void refresh()
  // Anthropic's limits move on the order of minutes/hours; poll hourly. Users
  // can force an immediate refresh with the button next to the chip.
  window.setInterval(refresh, 3_600_000)
  refreshBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    void refresh(true)
  })

  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const existing = document.querySelector('.usage-popover')
    if (existing) {
      existing.remove()
      return
    }
    const pop = (<div class="usage-popover" />) as HTMLDivElement
    document.body.append(pop)
    renderUsagePopover(pop, lastUsage)
    const rect = chip.getBoundingClientRect()
    pop.style.top = rect.bottom + 6 + 'px'
    pop.style.right = window.innerWidth - rect.right + 'px'
    const onDown = (ev: MouseEvent): void => {
      if (!pop.contains(ev.target as Node) && ev.target !== chip && !chip.contains(ev.target as Node)) {
        pop.remove()
        document.removeEventListener('mousedown', onDown, true)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', onDown, true))
  })
}

// Fire a notification card the first time session/week usage crosses each of
// 50/70/80/90/100% within a reset period. State persists so a crossing alerts
// once; it re-arms when the window's `resetsAt` advances.
const USAGE_THRESHOLDS = [50, 70, 80, 90, 100]
function evaluateUsageThresholds(u: RealUsage): void {
  const check = (
    win: UsageWindow | null,
    state: { resetsAt: number; level: number },
    label: string
  ): void => {
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

// Status bar version chip: shows the installed app version (base + git commit
// count it was built from) and flags "redeploy needed" when the source repo has
// moved ahead of the running build — either new commits or uncommitted edits.
// Clicking runs the self-update (deploy) flow, or briefly confirms it's current.
function initStatusbarVersion(): void {
  const chip = document.getElementById('statusbar-version')
  if (!chip) return
  const textEl = chip.querySelector('.version-text') as HTMLElement | null
  let base = '' // base semver from package.json (e.g. "0.1.0")
  let built: { commit: string | null; commitCount: number | null } | null = null
  let counter: number | null = null // monotonic save count for the source repo
  let needsRedeploy = false

  // The running build is stale when the repo's HEAD differs from what this build
  // was packaged from, or the repo has uncommitted changes (code changed but not
  // yet deployed). Skipped when there's no build info (dev) or no source repo.
  const evaluate = async (): Promise<void> => {
    const repo = settings.repoPath.trim()
    if (!repo || !built || !built.commit) {
      needsRedeploy = false
      chip.classList.remove('has-update')
      chip.title = base ? UITexts.Notifications.deployHint(base) : UITexts.Notifications.appName
      return
    }
    const repoGit = await appService.repoGit(repo)
    needsRedeploy = !!repoGit && (repoGit.commit !== built.commit || repoGit.dirty)
    chip.classList.toggle('has-update', needsRedeploy)
    if (needsRedeploy && repoGit) {
      const reason = repoGit.dirty ? 'uncommitted changes' : 'new commits'
      chip.title =
        `Redeploy needed — repo is ahead (${reason}).\n` +
        `Running build +${built.commitCount ?? '?'} → repo +${repoGit.commitCount}.\n` +
        `Click to rebuild & restart.`
    } else {
      chip.title = `Crafterm v${base}+${counter ?? built.commitCount ?? '?'} (up to date) · click to check`
    }
  }

  const refresh = async (): Promise<void> => {
    try {
      base = (await appService.version()) || ''
      built = await appService.buildInfo()
      const repo = settings.repoPath.trim()
      // The displayed "+N" is the live save counter (ticks up as code changes);
      // fall back to the built-from commit count when no source repo is set.
      counter = repo ? await appService.buildCounter(repo) : null
      if (textEl) {
        const n = counter ?? built?.commitCount ?? null
        const suffix = n != null ? `+${n}` : ''
        textEl.textContent = base ? `v${base}${suffix}` : 'v—'
      }
      await evaluate()
    } catch {
      // ignore — chip keeps its last value
    }
  }

  chip.addEventListener('click', async () => {
    await evaluate()
    // Source repo behind the running build (or none set yet): run the deploy flow.
    if (needsRedeploy || !settings.repoPath.trim()) {
      void runUpdate()
      return
    }
    // Up to date: flash a brief confirmation, then restore the version label.
    if (textEl) {
      const prev = textEl.textContent
      textEl.textContent = UITexts.Notifications.upToDate
      window.setTimeout(() => {
        if (textEl.textContent === UITexts.Notifications.upToDate) textEl.textContent = prev
      }, 1600)
    }
  })

  void refresh()
  // Re-read the counter and redeploy state periodically and on focus so saves
  // surface in the label without a manual click.
  window.setInterval(() => void refresh(), 20_000)
  window.addEventListener('focus', () => void refresh())
}

function renderUsagePopover(pop: HTMLElement, u: RealUsage | null): void {
  pop.replaceChildren()
  if (!u) {
    pop.insertAdjacentHTML('beforeend', '<div class="usage-empty">Loading…</div>')
    return
  }

  const model = shortModel(u.modelName) || UITexts.Notifications.claudeUsageFallback
  const head = (
    <div
      class="usage-head"
      innerHTML={
        `<div class="usage-title">${model}</div>` +
        `<div class="usage-sub">Official limits · ${fmtResetTime(u.fetchedAt).replace(/^Today /, 'updated ')}</div>`
      }
    />
  ) as HTMLDivElement
  pop.appendChild(head)

  if (u.error) {
    const err = (<div class="usage-empty">{usageErrorLong(u.error)}</div>) as HTMLDivElement
    pop.appendChild(err)
  }

  const bar = (label: string, win: UsageWindow | null): HTMLElement | null => {
    if (!win) return null
    const pct = Math.min(100, Math.round(win.utilization))
    return (
      <div
        class="usage-bar-wrap"
        innerHTML={
          `<div class="usage-bar-head"><b>${label}</b><span class="usage-pct">${pct}% used</span></div>` +
          `<div class="usage-bar"><div class="usage-bar-fill" style="width:${pct}%"></div></div>` +
          (win.resetsAt > 0
            ? `<div class="usage-bar-foot">resets ${fmtResetTime(win.resetsAt)}</div>`
            : '')
        }
      />
    ) as HTMLDivElement
  }
  const session = bar(UITexts.Notifications.bars.session, u.fiveHour)
  const week = bar(UITexts.Notifications.bars.week, u.sevenDay)
  const sonnet = bar(UITexts.Notifications.bars.weekSonnet, u.sevenDaySonnet)
  if (session) pop.appendChild(session)
  if (week) pop.appendChild(week)
  if (sonnet) pop.appendChild(sonnet)

  const foot = (
    <div class="usage-foot">
      <button
        class="usage-edit"
        onClick={() => {
          pop.remove()
          document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
        }}
      >
        Token source in Settings
      </button>
    </div>
  ) as HTMLDivElement
  pop.appendChild(foot)
}

function dismiss(id: string): void {
  notificationRepo.remove(id)
  expandedNotifs.delete(id)
  renderNotifications()
}

export function clearNotifications(): void {
  notificationRepo.clear()
  renderNotifications()
}

export function renderNotifications(): void {
  updateBadge()
  listEl.replaceChildren()
  if (!notificationRepo.getAll().length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty"></div>')
    return
  }
  notificationRepo.getAll().forEach((n) => {
    // State-based accent: reminder (blue), question/attention (amber), done (green).
    const tone =
      n.kind === 'reminder' ? 'reminder' : n.event === 'question' ? 'question' : n.event === 'done' ? 'done' : ''
    const expanded = expandedNotifs.has(n.id)

    const close = (
      <button
        class="notif-card-close"
        title={UITexts.Notifications.dismiss}
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          dismiss(n.id)
        }}
      >
        ×
      </button>
    ) as HTMLButtonElement

    // Always-visible header: chevron toggle + terminal name + relative time.
    // Collapsed, this is the entire card; the chevron reveals the body.
    const chevron = (
      <button
        class="notif-card-chevron"
        innerHTML={CHEVRON_SVG}
        title={expanded ? UITexts.Notifications.hideDetails : UITexts.Notifications.showDetails}
        onClick={(e: MouseEvent) => {
          e.stopPropagation()
          if (expandedNotifs.has(n.id)) expandedNotifs.delete(n.id)
          else expandedNotifs.add(n.id)
          renderNotifications()
        }}
      />
    ) as HTMLButtonElement

    const statusIcon = tone === 'question' ? QUESTION_SVG : tone === 'reminder' ? CLOCK_SVG : tone === 'done' ? CHECK_SVG : ''
    const titleText = (<span>{n.title}</span>) as HTMLSpanElement
    const title = (
      <span class="notif-card-title">
        {statusIcon && (<span class={'notif-card-status notif-status-' + tone} innerHTML={statusIcon} />)}
        {titleText}
      </span>
    ) as HTMLSpanElement
    if (n.projectColor) title.style.color = n.projectColor

    const time = (<span class="notif-card-time">{relTime(n.time)}</span>) as HTMLSpanElement
    const head = (
      <div class="notif-card-head">
        {chevron}
        {title}
        {time}
      </div>
    ) as HTMLDivElement

    // Collapsible body: message, source chips and per-card actions. Hidden via
    // CSS until the card carries the `expanded` class.
    const body = (
      <div class="notif-card-body">
        <div class="notif-card-msg">{n.message}</div>
      </div>
    ) as HTMLDivElement

    const card = (
      <div
        class={'notif-card' + (tone ? ' notif-' + tone : '') + (expanded ? ' expanded' : '')}
      >
        {close}
        {head}
        {body}
      </div>
    ) as HTMLDivElement
    // Status drives the left bar (via the notif-<tone> CSS class); the project
    // colour drives the title + background fill so the two readings stay distinct.
    if (n.projectColor) {
      card.style.background = `color-mix(in srgb, ${n.projectColor} 9%, transparent)`
    }

    // Detail line: rendered as small categorical chips so the source info
    // (project · branch · worktree · cwd) reads at a glance instead of a
    // long bullet-separated string.
    const chips: { cls: string; text: string; title?: string }[] = []
    if (n.group) chips.push({ cls: 'project', text: n.group, title: n.group })
    if (n.branch) chips.push({ cls: 'branch', text: n.branch, title: 'branch: ' + n.branch })
    if (n.worktree && n.worktree !== n.branch) {
      chips.push({ cls: 'worktree', text: n.worktree, title: 'worktree: ' + n.worktree })
    }
    if (n.cwd) chips.push({ cls: 'cwd', text: pathTail(n.cwd), title: n.cwd })
    if (chips.length) {
      const detail = (
        <div class="notif-card-detail">
          {chips.map((c) => {
            const el = (<span class={'notif-chip notif-chip-' + c.cls}>{c.text}</span>) as HTMLSpanElement
            if (c.title) el.title = c.title
            return el
          })}
        </div>
      ) as HTMLDivElement
      body.append(detail)
    }

    // "Remind me" only makes sense for pane cards — reminder cards already
    // carry a snooze row.
    if (n.kind !== 'reminder') body.append(buildRemindButton(n))

    if (n.kind === 'reminder') {
      const opener = resolvePayloadOpener(n.payload)
      if (opener) {
        const openRow = (
          <div class="notif-card-snooze notif-open-row">
            <button
              class="notif-snooze-chip notif-open-chip"
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                opener.open()
                dismiss(n.id)
              }}
            >
              {opener.label}
            </button>
          </div>
        ) as HTMLDivElement
        body.append(openRow)
        card.addEventListener('click', () => {
          opener.open()
          dismiss(n.id)
        })
      }
      body.append(buildSnoozeRow(n.reminderText ?? n.message, n.id, n.payload))
    } else {
      // Click a pane card: jump to its pane, then dismiss it. If the pane is
      // currently popped out into a separate window, focus that window instead
      // of the (placeholder) docked pane — otherwise the click is a no-op.
      card.addEventListener('click', () => {
        if (poppedOut.has(n.paneId)) terminalService.popoutFocus(n.paneId)
        else if (panes.has(n.paneId)) selectPane(n.paneId)
        dismiss(n.id)
      })
    }
    listEl.appendChild(card)
  })
}

// "Remind me later" snooze controls for a reminder notification card.
function buildSnoozeRow(
  text: string,
  notifId: string,
  payload?: import('@ui/types/types').ReminderPayload
): HTMLElement {
  return (
    <div class="notif-card-snooze">
      <span class="notif-snooze-label">{UITexts.Notifications.remindMeLater}</span>
      <div class="notif-snooze-chips">
        {snoozeOptions().map(
          (opt) =>
            (
              <button
                class="notif-snooze-chip"
                onClick={(e: MouseEvent) => {
                  e.stopPropagation()
                  snoozeReminder(text, opt.at, payload)
                  dismiss(notifId)
                }}
              >
                {opt.label}
              </button>
            ) as HTMLButtonElement
        )}
      </div>
    </div>
  ) as HTMLDivElement
}

// Labeled "Remind me" button in a pane card's detail body. Clicking it pops a
// time-picker that creates a reminder pointing back at the same pane — when it
// fires later, the resulting card carries an Open button (see resolvePayloadOpener).
function buildRemindButton(n: import('@ui/types/types').AppNotification): HTMLElement {
  const btn = (
    <button
      class="notif-card-remind"
      innerHTML={`<span class="notif-remind-icon">⏰</span><span>${UITexts.Notifications.remindMe}</span>`}
      title={UITexts.Notifications.remindMeAbout}
      onClick={(e: MouseEvent) => {
        e.stopPropagation()
        showPaneRemindPicker(btn, n)
      }}
    />
  ) as HTMLButtonElement
  return (<div class="notif-card-remind-row">{btn}</div>) as HTMLDivElement
}

function showPaneRemindPicker(anchor: HTMLElement, n: import('@ui/types/types').AppNotification): void {
  document.querySelector('.notif-remind-popover')?.remove()
  const pop = (
    <div class="notif-remind-popover">
      {snoozeOptions().map(
        (opt) =>
          (
            <button
              class="notif-snooze-chip"
              onClick={(e: MouseEvent) => {
                e.stopPropagation()
                snoozeReminder(n.title || n.message, opt.at, { kind: 'pane', paneId: n.paneId })
                pop.remove()
                dismiss(n.id)
              }}
            >
              {opt.label}
            </button>
          ) as HTMLButtonElement
      )}
    </div>
  ) as HTMLDivElement
  document.body.append(pop)
  const rect = anchor.getBoundingClientRect()
  pop.style.top = rect.bottom + 4 + 'px'
  pop.style.left = Math.max(8, rect.right - pop.offsetWidth) + 'px'
  const onDown = (ev: MouseEvent): void => {
    if (!pop.contains(ev.target as Node) && ev.target !== anchor) {
      pop.remove()
      document.removeEventListener('mousedown', onDown, true)
    }
  }
  setTimeout(() => document.addEventListener('mousedown', onDown, true))
}

// Resolve a reminder payload to a click action ("open this bookmark / pane /
// note"). Returns null when the target can no longer be found.
function resolvePayloadOpener(
  payload: import('@ui/types/types').ReminderPayload | undefined
): { label: string; open: () => void } | null {
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
    const n = meetingNoteRepo.get(payload.noteId)
    if (!n) return null
    return {
      label: UITexts.Notifications.cardActions.openMeeting,
      open: () => openMeetingNote(n.id)
    }
  }
  return null
}

// Switch the right panel between Alerts / Reminders / Files / Time / PR / Bookmarks / Daily views.
type RightTab = 'notifs' | 'reminders' | 'files' | 'time' | 'pr' | 'bm'
function switchTab(tab: RightTab): void {
  const views: Record<RightTab, string> = {
    notifs: 'notif-notifs-view',
    reminders: 'notif-reminders-view',
    files: 'notif-files-view',
    time: 'notif-time-view',
    pr: 'notif-pr-view',
    bm: 'notif-bm-view'
  }
  const tabs: Record<RightTab, string> = {
    notifs: 'notif-tab-notifs',
    reminders: 'notif-tab-reminders',
    files: 'notif-tab-files',
    time: 'notif-tab-time',
    pr: 'notif-tab-pr',
    bm: 'notif-tab-bm'
  }
  for (const k of Object.keys(views) as RightTab[]) {
    document.getElementById(views[k])!.style.display = k === tab ? 'flex' : 'none'
    document.getElementById(tabs[k])!.classList.toggle('active', k === tab)
  }
  if (tab === 'files') void renderExplorer() // refresh against the current cwd
  if (tab === 'time') renderTime()
  if (tab === 'bm') renderBookmarks()
  prTabVisible(tab === 'pr') // starts/stops the PR poll + initial render
}

export function initNotifications(): void {
  document.getElementById('notif-clear')!.addEventListener('click', clearNotifications)
  document
    .getElementById('statusbar-notif-toggle')!
    .addEventListener('click', toggleNotifPanel)
  initStatusbarUsage()
  initStatusbarVersion()
  document.getElementById('notif-add-reminder')!.addEventListener('click', () => openReminderForm())
  document.getElementById('notif-tab-notifs')!.addEventListener('click', () => switchTab('notifs'))
  document
    .getElementById('notif-tab-reminders')!
    .addEventListener('click', () => switchTab('reminders'))
  document.getElementById('notif-tab-files')!.addEventListener('click', () => switchTab('files'))
  document.getElementById('notif-tab-time')!.addEventListener('click', () => switchTab('time'))
  document.getElementById('notif-tab-pr')!.addEventListener('click', () => switchTab('pr'))
  document.getElementById('notif-tab-bm')!.addEventListener('click', () => switchTab('bm'))
  initExplorer()
  initTime()
  startAutoTracker()
  applyNotifSize()
  wireNotifResizer()
  applyNotifPanel()
  switchTab('notifs')
  renderNotifications()
  renderReminders()
  startReminderTimer()
}
