import './notifications.css'
import { notifState, panes, poppedOut, settings, pushNotification } from '../../state'
import { persistence } from '../../services/storage/persistence.service'
import { selectPane, openLink, openNote, openMarkdownFile } from '../../commands'
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
import { terminalService, claudeService, secretsService, appService } from '../../services/ipc'
import { fmtResetTime, usageErrorShort, usageErrorLong } from '../../services/domain/usage'
import { bookmarkRepo, dailyTaskRepo, meetingNoteRepo, notificationRepo } from '../../services/storage/repositories'
import { relTime, pathTail, shortModel } from './notif-format'

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
type RealUsage = Awaited<ReturnType<Window['crafterm']['claude']['realUsage']>>
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
    const pop = document.createElement('div')
    pop.className = 'usage-popover'
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
      'Claude Usage',
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
      chip.title = base ? `Crafterm v${base} · click to deploy` : 'Crafterm'
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
      textEl.textContent = 'up to date'
      window.setTimeout(() => {
        if (textEl.textContent === 'up to date') textEl.textContent = prev
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

  const head = document.createElement('div')
  head.className = 'usage-head'
  const model = shortModel(u.modelName) || 'Claude usage'
  head.innerHTML =
    `<div class="usage-title">${model}</div>` +
    `<div class="usage-sub">Official limits · ${fmtResetTime(u.fetchedAt).replace(/^Today /, 'updated ')}</div>`
  pop.appendChild(head)

  if (u.error) {
    const err = document.createElement('div')
    err.className = 'usage-empty'
    err.textContent = usageErrorLong(u.error)
    pop.appendChild(err)
  }

  const bar = (label: string, win: UsageWindow | null): HTMLElement | null => {
    if (!win) return null
    const wrap = document.createElement('div')
    wrap.className = 'usage-bar-wrap'
    const pct = Math.min(100, Math.round(win.utilization))
    wrap.innerHTML =
      `<div class="usage-bar-head"><b>${label}</b><span class="usage-pct">${pct}% used</span></div>` +
      `<div class="usage-bar"><div class="usage-bar-fill" style="width:${pct}%"></div></div>` +
      (win.resetsAt > 0
        ? `<div class="usage-bar-foot">resets ${fmtResetTime(win.resetsAt)}</div>`
        : '')
    return wrap
  }
  const session = bar('Current session', u.fiveHour)
  const week = bar('Current week (all models)', u.sevenDay)
  const sonnet = bar('Current week (Sonnet only)', u.sevenDaySonnet)
  if (session) pop.appendChild(session)
  if (week) pop.appendChild(week)
  if (sonnet) pop.appendChild(sonnet)

  const foot = document.createElement('div')
  foot.className = 'usage-foot'
  foot.innerHTML = `<button class="usage-edit">Token source in Settings</button>`
  foot.querySelector('button')?.addEventListener('click', () => {
    pop.remove()
    document.getElementById('settings-btn')?.dispatchEvent(new MouseEvent('click'))
  })
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
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No notifications</div>')
    return
  }
  notificationRepo.getAll().forEach((n) => {
    const card = document.createElement('div')
    // State-based accent: reminder (blue), question/attention (amber), done (green).
    const tone =
      n.kind === 'reminder' ? 'reminder' : n.event === 'question' ? 'question' : n.event === 'done' ? 'done' : ''
    card.className = 'notif-card' + (tone ? ' notif-' + tone : '')
    // Status drives the left bar (via the notif-<tone> CSS class); the project
    // colour drives the title + background fill so the two readings stay distinct.
    if (n.projectColor) {
      card.style.background = `color-mix(in srgb, ${n.projectColor} 9%, transparent)`
    }

    const expanded = expandedNotifs.has(n.id)
    if (expanded) card.classList.add('expanded')

    const close = document.createElement('button')
    close.className = 'notif-card-close'
    close.textContent = '×'
    close.title = 'Dismiss'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      dismiss(n.id)
    })

    // Always-visible header: chevron toggle + terminal name + relative time.
    // Collapsed, this is the entire card; the chevron reveals the body.
    const head = document.createElement('div')
    head.className = 'notif-card-head'
    const chevron = document.createElement('button')
    chevron.className = 'notif-card-chevron'
    chevron.innerHTML = CHEVRON_SVG
    chevron.title = expanded ? 'Hide details' : 'Show details'
    chevron.addEventListener('click', (e) => {
      e.stopPropagation()
      if (expandedNotifs.has(n.id)) expandedNotifs.delete(n.id)
      else expandedNotifs.add(n.id)
      renderNotifications()
    })
    const title = document.createElement('span')
    title.className = 'notif-card-title'
    if (n.projectColor) title.style.color = n.projectColor
    const statusIcon = tone === 'question' ? QUESTION_SVG : tone === 'reminder' ? CLOCK_SVG : tone === 'done' ? CHECK_SVG : ''
    if (statusIcon) {
      const icon = document.createElement('span')
      icon.className = 'notif-card-status notif-status-' + tone
      icon.innerHTML = statusIcon
      title.append(icon)
    }
    const titleText = document.createElement('span')
    titleText.textContent = n.title
    title.append(titleText)
    const time = document.createElement('span')
    time.className = 'notif-card-time'
    time.textContent = relTime(n.time)
    head.append(chevron, title, time)

    // Collapsible body: message, source chips and per-card actions. Hidden via
    // CSS until the card carries the `expanded` class.
    const body = document.createElement('div')
    body.className = 'notif-card-body'

    const msg = document.createElement('div')
    msg.className = 'notif-card-msg'
    msg.textContent = n.message
    body.append(msg)

    card.append(close, head, body)

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
      const detail = document.createElement('div')
      detail.className = 'notif-card-detail'
      for (const c of chips) {
        const el = document.createElement('span')
        el.className = 'notif-chip notif-chip-' + c.cls
        el.textContent = c.text
        if (c.title) el.title = c.title
        detail.appendChild(el)
      }
      body.append(detail)
    }

    // "Remind me" only makes sense for pane cards — reminder cards already
    // carry a snooze row.
    if (n.kind !== 'reminder') body.append(buildRemindButton(n))

    if (n.kind === 'reminder') {
      const opener = resolvePayloadOpener(n.payload)
      if (opener) {
        const openBtn = document.createElement('button')
        openBtn.className = 'notif-snooze-chip notif-open-chip'
        openBtn.textContent = opener.label
        openBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          opener.open()
          dismiss(n.id)
        })
        const openRow = document.createElement('div')
        openRow.className = 'notif-card-snooze notif-open-row'
        openRow.append(openBtn)
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
  payload?: import('../../types').ReminderPayload
): HTMLElement {
  const row = document.createElement('div')
  row.className = 'notif-card-snooze'
  const label = document.createElement('span')
  label.className = 'notif-snooze-label'
  label.textContent = 'Remind me later'
  row.append(label)
  const chips = document.createElement('div')
  chips.className = 'notif-snooze-chips'
  for (const opt of snoozeOptions()) {
    const b = document.createElement('button')
    b.className = 'notif-snooze-chip'
    b.textContent = opt.label
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      snoozeReminder(text, opt.at, payload)
      dismiss(notifId)
    })
    chips.append(b)
  }
  row.append(chips)
  return row
}

// Labeled "Remind me" button in a pane card's detail body. Clicking it pops a
// time-picker that creates a reminder pointing back at the same pane — when it
// fires later, the resulting card carries an Open button (see resolvePayloadOpener).
function buildRemindButton(n: import('../../types').AppNotification): HTMLElement {
  const row = document.createElement('div')
  row.className = 'notif-card-remind-row'
  const btn = document.createElement('button')
  btn.className = 'notif-card-remind'
  btn.innerHTML = '<span class="notif-remind-icon">⏰</span><span>Remind me</span>'
  btn.title = 'Remind me about this'
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    showPaneRemindPicker(btn, n)
  })
  row.append(btn)
  return row
}

function showPaneRemindPicker(anchor: HTMLElement, n: import('../../types').AppNotification): void {
  document.querySelector('.notif-remind-popover')?.remove()
  const pop = document.createElement('div')
  pop.className = 'notif-remind-popover'
  for (const opt of snoozeOptions()) {
    const b = document.createElement('button')
    b.className = 'notif-snooze-chip'
    b.textContent = opt.label
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      snoozeReminder(n.title || n.message, opt.at, { kind: 'pane', paneId: n.paneId })
      pop.remove()
      dismiss(n.id)
    })
    pop.append(b)
  }
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
  payload: import('../../types').ReminderPayload | undefined
): { label: string; open: () => void } | null {
  if (!payload) return null
  if (payload.kind === 'bookmark') {
    const bm = bookmarkRepo.get(payload.bookmarkId)
    if (!bm) return null
    return {
      label: bm.type === 'link' ? 'Open' : 'Show',
      open: () => void openLink(bm.content)
    }
  }
  if (payload.kind === 'pane') {
    if (!panes.has(payload.paneId) && !poppedOut.has(payload.paneId)) return null
    return {
      label: 'Go to pane',
      open: () => {
        if (poppedOut.has(payload.paneId)) terminalService.popoutFocus(payload.paneId)
        else selectPane(payload.paneId)
      }
    }
  }
  if (payload.kind === 'notebook') {
    return {
      label: 'Open note',
      open: () => void openNote(payload.path)
    }
  }
  if (payload.kind === 'dailyTask') {
    const t = dailyTaskRepo.get(payload.taskId)
    if (!t) return null
    return {
      label: 'Open task',
      open: () => showDailyPlanModal(t.date, t.id)
    }
  }
  if (payload.kind === 'plan') {
    return {
      label: 'Open plan',
      open: () => openMarkdownFile(payload.path)
    }
  }
  if (payload.kind === 'meetingNote') {
    const n = meetingNoteRepo.get(payload.noteId)
    if (!n) return null
    return {
      label: 'Open meeting',
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
