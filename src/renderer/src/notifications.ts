import { notifications, notifState, panes, settings, saveSoon } from './state'
import { selectPane } from './commands'
import {
  renderReminders,
  openReminderForm,
  startReminderTimer,
  snoozeReminder,
  snoozeOptions
} from './reminders'
import { renderExplorer, initExplorer } from './explorer'
import { renderTime, initTime, startAutoTracker } from './time'

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
      saveSoon()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  })
}

function relTime(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.floor(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.floor(h)}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Last `n` path segments, prefixed with an ellipsis when trimmed (e.g. …/a/b/c).
function pathTail(p: string, n = 3): string {
  const parts = p.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length <= n) return p
  return '…/' + parts.slice(-n).join('/')
}

export function applyNotifPanel(): void {
  appEl.classList.toggle('notif-open', notifState.open)
  updateBadge()
}

// Unread count on the bell icon (shown while the panel is closed).
function updateBadge(): void {
  const badge = document.getElementById('notif-badge')
  if (!badge) return
  const n = notifications.length
  badge.textContent = n > 99 ? '99+' : String(n)
  badge.style.display = n > 0 ? 'flex' : 'none'
}

export function toggleNotifPanel(): void {
  notifState.open = !notifState.open
  applyNotifPanel()
  if (notifState.open) renderNotifications()
}

function dismiss(id: string): void {
  const i = notifications.findIndex((x) => x.id === id)
  if (i >= 0) notifications.splice(i, 1)
  renderNotifications()
}

export function clearNotifications(): void {
  notifications.length = 0
  renderNotifications()
}

export function renderNotifications(): void {
  updateBadge()
  listEl.replaceChildren()
  if (!notifications.length) {
    listEl.insertAdjacentHTML('beforeend', '<div class="notif-empty">No notifications</div>')
    return
  }
  notifications.forEach((n) => {
    const card = document.createElement('div')
    // State-based accent: reminder (blue), question/attention (amber), done (green).
    const tone =
      n.kind === 'reminder' ? 'reminder' : n.event === 'question' ? 'question' : n.event === 'done' ? 'done' : ''
    card.className = 'notif-card' + (tone ? ' notif-' + tone : '')

    const close = document.createElement('button')
    close.className = 'notif-card-close'
    close.textContent = '×'
    close.title = 'Dismiss'
    close.addEventListener('click', (e) => {
      e.stopPropagation()
      dismiss(n.id)
    })

    const top = document.createElement('div')
    top.className = 'notif-card-top'
    const title = document.createElement('span')
    title.className = 'notif-card-title'
    title.textContent = n.title
    const time = document.createElement('span')
    time.className = 'notif-card-time'
    time.textContent = relTime(n.time)
    top.append(title, time)

    const msg = document.createElement('div')
    msg.className = 'notif-card-msg'
    msg.textContent = n.message

    card.append(close, top, msg)

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
      card.append(detail)
    }

    if (n.kind === 'reminder') {
      card.append(buildSnoozeRow(n.reminderText ?? n.message, n.id))
    } else {
      // Click a pane card: jump to its pane, then dismiss it.
      card.addEventListener('click', () => {
        if (panes.has(n.paneId)) selectPane(n.paneId)
        dismiss(n.id)
      })
    }
    listEl.appendChild(card)
  })
}

// "Remind me later" snooze controls for a reminder notification card.
function buildSnoozeRow(text: string, notifId: string): HTMLElement {
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
      snoozeReminder(text, opt.at)
      dismiss(notifId)
    })
    chips.append(b)
  }
  row.append(chips)
  return row
}

// Switch the right panel between Alerts / Reminders / Files views.
type RightTab = 'notifs' | 'reminders' | 'files' | 'time'
function switchTab(tab: RightTab): void {
  const views: Record<RightTab, string> = {
    notifs: 'notif-notifs-view',
    reminders: 'notif-reminders-view',
    files: 'notif-files-view',
    time: 'notif-time-view'
  }
  const tabs: Record<RightTab, string> = {
    notifs: 'notif-tab-notifs',
    reminders: 'notif-tab-reminders',
    files: 'notif-tab-files',
    time: 'notif-tab-time'
  }
  for (const k of Object.keys(views) as RightTab[]) {
    document.getElementById(views[k])!.style.display = k === tab ? 'flex' : 'none'
    document.getElementById(tabs[k])!.classList.toggle('active', k === tab)
  }
  if (tab === 'files') void renderExplorer() // refresh against the current cwd
  if (tab === 'time') renderTime()
}

export function initNotifications(): void {
  document.getElementById('notif-clear')!.addEventListener('click', clearNotifications)
  document.getElementById('notif-show')!.addEventListener('click', toggleNotifPanel)
  document.getElementById('notif-hide')!.addEventListener('click', toggleNotifPanel)
  document.getElementById('notif-add-reminder')!.addEventListener('click', () => openReminderForm())
  document.getElementById('notif-tab-notifs')!.addEventListener('click', () => switchTab('notifs'))
  document
    .getElementById('notif-tab-reminders')!
    .addEventListener('click', () => switchTab('reminders'))
  document.getElementById('notif-tab-files')!.addEventListener('click', () => switchTab('files'))
  document.getElementById('notif-tab-time')!.addEventListener('click', () => switchTab('time'))
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
