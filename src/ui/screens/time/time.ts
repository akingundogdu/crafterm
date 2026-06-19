import './time.css'
import { settings, uid, state, panes } from '../../state'
import { persistence } from '../../services/storage/persistence.service'
import { promptText } from '../../dialog'
import { flattenProjects, findProjectByPath } from '../../catalog'
import { appService } from '@services'
import { timeEntryRepo } from '../../services/storage/repositories'
import {
  fmtClock,
  fmtHM,
  startOfToday,
  sumByProject
} from '../../services/domain/time'
import { showReport } from './components/time-report'
import { openTrackModal } from './components/track-modal'

// Re-exported for main.ts, which still imports openTrackModal from the time module.
export { openTrackModal } from './components/track-modal'

const IDLE_MS = 5 * 60_000 // no activity this long ⇒ stop auto-counting

// The running timer (null when stopped). Survives tab switches.
// `pomodoroMs` set ⇒ it's a countdown that auto-finishes (alarm + log).
let active: {
  projectPath: string
  featureId: string | null
  start: number
  pomodoroMs?: number
  repeat?: boolean // when a pomodoro finishes, auto-start another of the same length
} | null = null
let ticker: number | null = null

// Automatic (terminal-bound) tracking: counts while a tracked terminal is the
// active pane, the window is focused, and there's recent activity.
let autoSession: {
  paneId: string
  projectPath: string
  featureId: string | null
  start: number
} | null = null
let lastUserActivity = Date.now()

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}
function projectSel(): HTMLSelectElement {
  return el('time-project')
}
function featureSel(): HTMLSelectElement {
  return el('time-feature')
}

function renderProjects(): void {
  const sel = projectSel()
  const prev = sel.value
  sel.replaceChildren()
  const projects = flattenProjects(state.tree)
  if (!projects.length) {
    sel.insertAdjacentHTML('beforeend', '<option value="">(no projects)</option>')
  }
  for (const p of projects) {
    const o = document.createElement('option')
    o.value = p.path
    o.textContent = p.name
    sel.appendChild(o)
  }
  if (prev) sel.value = prev
  renderFeatures()
}

function renderFeatures(): void {
  const sel = featureSel()
  const projPath = projectSel().value
  const prev = sel.value
  sel.replaceChildren()
  sel.insertAdjacentHTML('beforeend', '<option value="">(no feature)</option>')
  const owner = projPath ? findProjectByPath(state.tree, projPath) : null
  for (const f of owner?.features ?? []) {
    const o = document.createElement('option')
    o.value = f.id
    o.textContent = f.name
    sel.appendChild(o)
  }
  if (prev) sel.value = prev
}

function renderSummary(): void {
  const sum = el('time-summary')
  sum.replaceChildren()
  sum.insertAdjacentHTML('beforeend', '<div class="time-summary-head">Today</div>')
  const now = Date.now()
  const ongoing = [
    active && { projectPath: active.projectPath, ms: now - active.start },
    autoSession && { projectPath: autoSession.projectPath, ms: now - autoSession.start }
  ].filter((o): o is { projectPath: string; ms: number } => !!o)
  const byProj = sumByProject(timeEntryRepo.getAll(), startOfToday(now), ongoing)
  if (!byProj.size) {
    sum.insertAdjacentHTML('beforeend', '<div class="notif-empty">No time logged today</div>')
    return
  }
  for (const [path, ms] of byProj) {
    const proj = findProjectByPath(state.tree, path)
    const row = document.createElement('div')
    row.className = 'time-summary-row'
    const name = document.createElement('span')
    name.className = 'time-summary-name'
    name.textContent = proj?.name ?? path
    const dur = document.createElement('span')
    dur.className = 'time-summary-dur'
    dur.textContent = fmtHM(ms)
    row.append(name, dur)
    sum.appendChild(row)
  }
}

function tickElapsed(): void {
  if (!active) {
    el('time-elapsed').textContent = '00:00:00'
    return
  }
  const elapsed = Date.now() - active.start
  // pomodoro shows remaining (countdown); manual shows elapsed (count up)
  el('time-elapsed').textContent = active.pomodoroMs
    ? fmtClock(Math.max(0, active.pomodoroMs - elapsed))
    : fmtClock(elapsed)
}

// Single timer loop: finish a due pomodoro, otherwise refresh the display.
function onTick(): void {
  if (active?.pomodoroMs && Date.now() - active.start >= active.pomodoroMs) {
    finishPomodoro()
    return
  }
  tickElapsed()
  renderSummary()
}

function updateToggle(): void {
  const btn = el<HTMLButtonElement>('time-toggle')
  btn.textContent = active ? 'Stop' : 'Start'
  btn.classList.toggle('running', !!active)
  projectSel().disabled = !!active
  featureSel().disabled = !!active
  document
    .querySelectorAll<HTMLButtonElement>('.time-pom-preset')
    .forEach((b) => (b.disabled = !!active))
}

// Log the active interval (if long enough) and clear the timer.
function stopActive(): void {
  if (active) {
    const dur = Date.now() - active.start
    if (dur >= 1000) {
      timeEntryRepo.upsert({
        id: uid('te'),
        projectPath: active.projectPath,
        featureId: active.featureId || undefined,
        start: active.start,
        end: Date.now(),
        source: active.pomodoroMs ? 'pomodoro' : 'manual'
      })
    }
  }
  active = null
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
}

// Manual Start/Stop button.
function toggle(): void {
  if (active) {
    stopActive()
  } else {
    const projectPath = projectSel().value
    if (!projectPath) return
    active = { projectPath, featureId: featureSel().value || null, start: Date.now() }
    ticker = window.setInterval(onTick, 1000)
  }
  updateToggle()
  tickElapsed()
  renderSummary()
}

// Start a countdown pomodoro for `ms`. `repeat` re-arms it after each finish.
function startPomodoro(ms: number, repeat = false): void {
  if (active) return
  const projectPath = projectSel().value
  if (!projectPath) return
  active = {
    projectPath,
    featureId: featureSel().value || null,
    start: Date.now(),
    pomodoroMs: ms,
    repeat
  }
  ticker = window.setInterval(onTick, 1000)
  updateToggle()
  tickElapsed()
  renderSummary()
}

// Pomodoro reached its end: log it, alert + sound, then re-arm if repeating.
function finishPomodoro(): void {
  const proj = active ? findProjectByPath(state.tree, active.projectPath) : null
  const ms = active?.pomodoroMs
  const repeat = active?.repeat
  const projectPath = active?.projectPath
  const featureId = active?.featureId ?? null
  stopActive()
  appService.notify('Pomodoro done', `${proj?.name ?? 'Session'} · time logged`)
  if (settings.notifSound) appService.playSound(settings.notifSound)
  // Re-arm the same countdown for repeating pomodoros (no project select needed).
  if (repeat && ms && projectPath) {
    active = { projectPath, featureId, start: Date.now(), pomodoroMs: ms, repeat: true }
    ticker = window.setInterval(onTick, 1000)
  }
  updateToggle()
  tickElapsed()
  renderSummary()
}

async function addFeature(): Promise<void> {
  const projPath = projectSel().value
  if (!projPath) return
  const owner = findProjectByPath(state.tree, projPath)
  if (!owner) return
  const name = await promptText({
    title: 'New feature',
    label: 'Feature name',
    placeholder: 'e.g. auth setup',
    confirmText: 'Add'
  })
  if (!name || !name.trim()) return
  const f = { id: uid('ft'), name: name.trim() }
  owner.features = owner.features ?? []
  owner.features.push(f)
  persistence.save()
  renderFeatures()
  featureSel().value = f.id
}

// ---- automatic terminal-bound tracking ----

function closeAutoSession(): void {
  if (!autoSession) return
  const dur = Date.now() - autoSession.start
  if (dur >= 1000) {
    timeEntryRepo.upsert({
      id: uid('te'),
      projectPath: autoSession.projectPath,
      featureId: autoSession.featureId || undefined,
      start: autoSession.start,
      end: Date.now(),
      source: 'auto'
    })
  }
  autoSession = null
}

function autoTick(): void {
  const id = state.activePaneId
  const pane = id ? panes.get(id) : null
  const tracked = pane?.trackProjectPath
  const userActive = Date.now() - lastUserActivity < IDLE_MS
  const termActive = pane ? Date.now() - pane.lastActivity < IDLE_MS : false
  const shouldTrack = !!tracked && document.hasFocus() && (userActive || termActive)
  if (shouldTrack && pane && id) {
    if (!autoSession || autoSession.paneId !== id) {
      closeAutoSession()
      autoSession = {
        paneId: id,
        projectPath: pane.trackProjectPath!,
        featureId: pane.trackFeatureId ?? null,
        start: Date.now()
      }
    }
  } else {
    closeAutoSession()
  }
  renderSummary()
}

export function startAutoTracker(): void {
  document.addEventListener('mousemove', () => (lastUserActivity = Date.now()), true)
  document.addEventListener('keydown', () => (lastUserActivity = Date.now()), true)
  window.setInterval(autoTick, 30_000)
}

export function renderTime(): void {
  renderProjects()
  updateToggle()
  tickElapsed()
  renderSummary()
}

export function initTime(): void {
  projectSel().addEventListener('change', renderFeatures)
  el('time-toggle').addEventListener('click', toggle)
  el('time-add-feature').addEventListener('click', () => void addFeature())
  const repeatOf = (): boolean => el<HTMLInputElement>('time-pom-repeat').checked
  document.querySelectorAll<HTMLButtonElement>('.time-pom-preset').forEach((b) => {
    b.addEventListener('click', () => startPomodoro(Number(b.dataset.min) * 60_000, repeatOf()))
  })
  // Custom-length countdown timer with optional repeat.
  el('time-pom-start').addEventListener('click', () => {
    const min = Number(el<HTMLInputElement>('time-pom-min').value)
    if (!Number.isFinite(min) || min <= 0) return
    startPomodoro(min * 60_000, repeatOf())
  })
  el<HTMLInputElement>('time-pom-min').addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') el('time-pom-start').click()
  })
  el('time-report-btn').addEventListener('click', showReport)
}
