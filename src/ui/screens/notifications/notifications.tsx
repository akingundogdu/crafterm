import './notifications.css'
import { notifState, settings } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { renderReminders, openReminderForm, startReminderTimer } from '../reminders/reminders'
import { renderExplorer, initExplorer } from '../explorer/explorer'
import { prTabVisible } from '../pr/pr'
import { renderBookmarks } from '../bookmarks/bookmarks'
import { renderTime, initTime, startAutoTracker } from '../time/time'
import { notificationRepo } from '@repositories'
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
import { buildNotificationCard } from './components/notification-card'
import { buildRemindPopover } from './components/remind-popover'

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
    listEl.insertAdjacentHTML('beforeend', `<div class="notif-empty">${UITexts.Notifications.empty}</div>`)
    return
  }
  notificationRepo.getAll().forEach((n) => {
    const card = buildNotificationCard({
      notif: n,
      tone: toneOf(n),
      expanded: isNotifExpanded(n.id),
      chevronSvg: CHEVRON_SVG,
      statusIcon: statusIconFor(toneOf(n)),
      chips: buildNotifChips(n),
      opener: resolvePayloadOpener(n.payload),
      onDismissClick: (id) => makeDismissClick(id, dismiss),
      onChevronClick: (id) => makeChevronClick(id, renderNotifications),
      onOpenerClick: (opener, id) => makeOpenerClick(opener, id, dismiss),
      onReminderCardClick: (opener, id) => makeReminderCardClick(opener, id, dismiss),
      onPaneCardClick: (notif) => makePaneCardClick(notif, dismiss),
      onSnoozeChipClick: (text, at, payload, notifId) =>
        makeSnoozeChipClick(text, at, payload, notifId, dismiss),
      showRemindPicker: showPaneRemindPicker
    })
    listEl.appendChild(card)
  })
}

function showPaneRemindPicker(anchor: HTMLElement, n: import('@ui/types/types').AppNotification): void {
  document.querySelector('.notif-remind-popover')?.remove()
  const pop = buildRemindPopover({
    notif: n,
    close: () => pop.remove(),
    onChipClick: (notif, at, close) => makePaneRemindChipClick(notif, at, close, dismiss)
  })
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
