import './notifications.css'
import { notifState, panes, poppedOut, settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { selectPane } from '@ui/commands/commands'
import { renderReminders, openReminderForm, startReminderTimer, snoozeOptions } from '../reminders/reminders'
import { renderExplorer, initExplorer } from '../explorer/explorer'
import { prTabVisible } from '../pr/pr'
import { renderBookmarks } from '../bookmarks/bookmarks'
import { renderTime, initTime, startAutoTracker } from '../time/time'
import { terminalService } from '@services'
import { notificationRepo } from '@repositories'
import { relTime } from './notif-format'
import { UITexts } from '@texts'
import { updateNotifBadge } from '@ui/components/status-bar/status-bar'
import type { RightTab } from './notifications.types'
import {
  CHEVRON_SVG,
  isNotifExpanded,
  removeNotif,
  toneOf,
  statusIconFor,
  buildNotifChips,
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

// Unread count on the bell icon (shown while the panel is closed). The badge DOM
// lives in the status bar component; this owns the data and pushes it there (S1).
function updateBadge(): void {
  updateNotifBadge(notificationRepo.getAll().length)
}

export function toggleNotifPanel(): void {
  notifState.open = !notifState.open
  applyNotifPanel()
  if (notifState.open) renderNotifications()
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
