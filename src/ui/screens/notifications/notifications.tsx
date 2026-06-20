import './notifications.css'
import { notifState, panes, poppedOut, settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { selectPane } from '@ui/commands/commands'
import { renderReminders, openReminderForm, startReminderTimer, snoozeOptions } from '../reminders/reminders'
import { renderExplorer, initExplorer } from '../explorer/explorer'
import { prTabVisible } from '../pr/pr'
import { renderBookmarks } from '../bookmarks/bookmarks'
import { renderTime, initTime, startAutoTracker } from '../time/time'
import { runUpdate } from '../pickers/update/update'
import { terminalService, appService } from '@services'
import { fmtResetTime, usageErrorShort, usageErrorLong } from '@services/domain/usage'
import { notificationRepo } from '@repositories'
import { relTime, shortModel } from './notif-format'
import { UITexts } from '@texts'
import type { RealUsage, UsageWindow, RightTab } from './notifications.types'
import {
  CHEVRON_SVG,
  isNotifExpanded,
  removeNotif,
  toneOf,
  statusIconFor,
  buildNotifChips,
  fetchRealUsage,
  evaluateUsageThresholds,
  resolvePayloadOpener,
  makeDismissClick,
  makeChevronClick,
  makeSnoozeChipClick,
  makeOpenerClick,
  makeReminderCardClick,
  makePaneCardClick,
  makePaneRemindChipClick
} from './notifications.state'

const appEl = document.getElementById('app')!
const listEl = document.getElementById('notif-list')!
const panelEl = document.getElementById('notif-panel')!

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

// Status bar Claude usage chip: polls hourly. Compact display shows the active
// model + this-week percentage; clicking opens a popover with full today / week /
// month progress bars (mirrors Claude's /usage TUI).
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
          (win.resetsAt > 0 ? `<div class="usage-bar-foot">resets ${fmtResetTime(win.resetsAt)}</div>` : '')
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
  removeNotif(id)
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
    const tone = toneOf(n)
    const expanded = isNotifExpanded(n.id)

    const close = (
      <button class="notif-card-close" title={UITexts.Notifications.dismiss} onClick={makeDismissClick(n.id, dismiss)}>
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
        onClick={makeChevronClick(n.id, renderNotifications)}
      />
    ) as HTMLButtonElement

    const statusIcon = statusIconFor(tone)
    const titleText = (<span>{n.title}</span>) as HTMLSpanElement
    const title = (
      <span class="notif-card-title">
        {statusIcon && <span class={'notif-card-status notif-status-' + tone} innerHTML={statusIcon} />}
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
      <div class={'notif-card' + (tone ? ' notif-' + tone : '') + (expanded ? ' expanded' : '')}>
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
    // (project · branch · worktree · cwd) reads at a glance.
    const chips = buildNotifChips(n)
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
            <button class="notif-snooze-chip notif-open-chip" onClick={makeOpenerClick(opener, n.id, dismiss)}>
              {opener.label}
            </button>
          </div>
        ) as HTMLDivElement
        body.append(openRow)
        card.addEventListener('click', makeReminderCardClick(opener, n.id, dismiss))
      }
      body.append(buildSnoozeRow(n.reminderText ?? n.message, n.id, n.payload))
    } else {
      card.addEventListener('click', makePaneCardClick(n, dismiss))
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
              <button class="notif-snooze-chip" onClick={makeSnoozeChipClick(text, opt.at, payload, notifId, dismiss)}>
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
            <button class="notif-snooze-chip" onClick={makePaneRemindChipClick(n, opt.at, () => pop.remove(), dismiss)}>
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

// Switch the right panel between Alerts / Reminders / Files / Time / PR / Bookmarks views.
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
  document.getElementById('statusbar-notif-toggle')!.addEventListener('click', toggleNotifPanel)
  initStatusbarUsage()
  initStatusbarVersion()
  document.getElementById('notif-add-reminder')!.addEventListener('click', () => openReminderForm())
  document.getElementById('notif-tab-notifs')!.addEventListener('click', () => switchTab('notifs'))
  document.getElementById('notif-tab-reminders')!.addEventListener('click', () => switchTab('reminders'))
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
