import '@views/screens/notifications/notifications.css'
import { notifState, settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { notificationRepo } from '@repositories'
import { updateNotifBadge } from '@views/components/status-bar/components/notif-badge'
import type { RightTab } from './notifications.types'
import Notifications from './notifications'
import store from './notifications.store'
import Reminders from '@views/screens/reminders/reminders'
import { openReminderForm } from '@views/screens/reminders/components/reminder-form.open'
import { startReminderTimer } from '@views/screens/reminders/reminders.engine'
import { renderExplorer, initExplorer } from '@views/screens/explorer/explorer'
import Time from '@views/screens/time/time'
import timeStore from '@views/screens/time/time.store'
import Pr from '@views/screens/pr/pr'
import prStore from '@views/screens/pr/pr.store'
import Bookmarks from '@views/screens/bookmarks/bookmarks'

// Imperative shell for the right notification panel (gea tree, §2.7). The panel
// chrome (tabs, resizer, view containers) is static markup in index.html; this
// controller wires the chrome and mounts the gea panels (Alerts list, Reminders,
// Files, Time, PR, Bookmarks) into their static tab hosts. The reactive card list
// itself is the gea Notifications component; mutations flow through its store.

const appEl = document.getElementById('app')!
const listEl = document.getElementById('notif-list')!
const panelEl = document.getElementById('notif-panel')!

let notifListMounted = false
let prMounted = false

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
  updateNotifBadge(notificationRepo.getAll().length)
}

export function toggleNotifPanel(): void {
  notifState.open = !notifState.open
  applyNotifPanel()
  if (notifState.open) renderNotifications()
}

export function clearNotifications(): void {
  store.clear()
}

// Mount the reactive Alerts card list once into its static host, then resync the
// store on every subsequent call (gea patches the list — no full re-render).
export function renderNotifications(): void {
  if (!notifListMounted) {
    listEl.replaceChildren()
    new Notifications().render(listEl)
    notifListMounted = true
    return // created() already ran store.reload()
  }
  store.reload()
}

// Mount the gea Reminders panel once into its static host (#reminder-list); the
// fire-timer + snooze flows refresh it reactively via the reminders store.
function renderReminders(): void {
  const el = document.getElementById('reminder-list')!
  el.replaceChildren()
  new Reminders().render(el)
}

// Mount (or remount) the gea Time panel into its tab host.
function renderTime(): void {
  const host = document.getElementById('notif-time-view')!
  host.replaceChildren()
  new Time().render(host)
}

// Mount (or remount) the gea Bookmarks panel into its tab host.
function renderBookmarks(): void {
  const el = document.getElementById('notif-bm-view')!
  el.replaceChildren()
  new Bookmarks().render(el)
}

function ensurePrMounted(): void {
  if (prMounted) return
  const el = document.getElementById('notif-pr-view')!
  el.replaceChildren()
  new Pr().render(el)
  prMounted = true
}

function prTabVisible(visible: boolean): void {
  if (visible) ensurePrMounted()
  prStore.setTabVisible(visible)
}

// Switch the right panel between Alerts / Reminders / Files / Time / PR / Bookmarks.
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
  timeStore.startAutoTracker()
  applyNotifSize()
  wireNotifResizer()
  applyNotifPanel()
  switchTab('notifs')
  renderNotifications()
  renderReminders()
  startReminderTimer()
}
