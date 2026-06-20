import './time.css'
import { settings, uid, state, panes } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { promptText } from '@ui/dialog/dialog'
import { flattenProjects, findProjectByPath } from '@ui/catalog/catalog'
import { appService , soundService } from '@services'
import { timeEntryRepo } from '@repositories'
import { UITexts } from '@texts'
import {
  fmtClock,
  fmtHM,
  startOfToday,
  sumByProject
} from '@services/domain/time'
import { showReport } from './components/time-report'
import { openTrackModal } from './components/track-modal'
import type { ActiveTimer, AutoSession } from './time.types'
import { logInterval, shouldTrackPane } from './time.state'

// Re-exported for main.ts, which still imports openTrackModal from the time module.
export { openTrackModal } from './components/track-modal'

// The running timer (null when stopped). Survives tab switches.
let active: ActiveTimer | null = null
let ticker: number | null = null

// Automatic (terminal-bound) tracking session (null when idle).
let autoSession: AutoSession | null = null
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
    sel.insertAdjacentHTML('beforeend', `<option value=""></option>`)
  }
  for (const p of projects) {
    const o = (
      <option value={p.path}>{p.name}</option>
    ) as HTMLOptionElement
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
  sel.insertAdjacentHTML('beforeend', `<option value=""></option>`)
  const owner = projPath ? findProjectByPath(state.tree, projPath) : null
  for (const f of owner?.features ?? []) {
    const o = (
      <option value={f.id}>{f.name}</option>
    ) as HTMLOptionElement
    sel.appendChild(o)
  }
  if (prev) sel.value = prev
}

function renderSummary(): void {
  const sum = el('time-summary')
  sum.replaceChildren()
  sum.insertAdjacentHTML('beforeend', `<div class="time-summary-head"></div>`)
  const now = Date.now()
  const ongoing = [
    active && { projectPath: active.projectPath, ms: now - active.start },
    autoSession && { projectPath: autoSession.projectPath, ms: now - autoSession.start }
  ].filter((o): o is { projectPath: string; ms: number } => !!o)
  const byProj = sumByProject(timeEntryRepo.getAll(), startOfToday(now), ongoing)
  if (!byProj.size) {
    sum.insertAdjacentHTML('beforeend', `<div class="notif-empty"></div>`)
    return
  }
  for (const [path, ms] of byProj) {
    const proj = findProjectByPath(state.tree, path)
    const row = (
      <div class="time-summary-row">
        <span class="time-summary-name">{proj?.name ?? path}</span>
        <span class="time-summary-dur">{fmtHM(ms)}</span>
      </div>
    ) as HTMLDivElement
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
  btn.textContent = active ? UITexts.Time.stop : UITexts.Time.start
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
    logInterval(active, active.pomodoroMs ? 'pomodoro' : 'manual')
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
  appService.notify(UITexts.Time.pomodoroDoneTitle, UITexts.Time.pomodoroBody(proj?.name ?? UITexts.Time.sessionFallback))
  if (settings.notifSound) soundService.play(settings.notifSound)
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
    title: UITexts.Time.newFeature.title,
    label: UITexts.Time.newFeature.label,
    placeholder: UITexts.Time.newFeature.placeholder,
    confirmText: UITexts.Time.newFeature.confirm
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
  logInterval(autoSession, 'auto')
  autoSession = null
}

function autoTick(): void {
  const id = state.activePaneId
  const pane = id ? panes.get(id) : null
  if (shouldTrackPane(pane, lastUserActivity) && pane && id) {
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
