import { settings, saveSoon, uid, state, panes } from './state'
import type { TimeEntry } from './types'
import { promptText, makeCloseButton } from './dialog'
import { updatePaneStatus } from './pane'
import { flattenProjects, findProjectByPath, findFeature } from './catalog'

const IDLE_MS = 5 * 60_000 // no activity this long ⇒ stop auto-counting

// The running timer (null when stopped). Survives tab switches.
// `pomodoroMs` set ⇒ it's a countdown that auto-finishes (alarm + log).
let active: {
  projectPath: string
  featureId: string | null
  start: number
  pomodoroMs?: number
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

function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`
}
function fmtHM(ms: number): string {
  const m = Math.round(ms / 60000)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}
function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
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
  const today0 = startOfToday()
  const byProj = new Map<string, number>()
  for (const e of settings.timeEntries) {
    if (e.end < today0) continue
    byProj.set(e.projectPath, (byProj.get(e.projectPath) ?? 0) + (e.end - e.start))
  }
  if (active) {
    byProj.set(active.projectPath, (byProj.get(active.projectPath) ?? 0) + (Date.now() - active.start))
  }
  if (autoSession) {
    byProj.set(
      autoSession.projectPath,
      (byProj.get(autoSession.projectPath) ?? 0) + (Date.now() - autoSession.start)
    )
  }
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
      settings.timeEntries.push({
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
  saveSoon()
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

// Start a countdown pomodoro for `ms`.
function startPomodoro(ms: number): void {
  if (active) return
  const projectPath = projectSel().value
  if (!projectPath) return
  active = { projectPath, featureId: featureSel().value || null, start: Date.now(), pomodoroMs: ms }
  ticker = window.setInterval(onTick, 1000)
  updateToggle()
  tickElapsed()
  renderSummary()
}

// Pomodoro reached its end: log it, then alert + sound.
function finishPomodoro(): void {
  const proj = active ? findProjectByPath(state.tree, active.projectPath) : null
  stopActive()
  window.crafterm.notify('Pomodoro done', `${proj?.name ?? 'Session'} · time logged`)
  if (settings.notifSound) window.crafterm.playSound(settings.notifSound)
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
  saveSoon()
  renderFeatures()
  featureSel().value = f.id
}

type Range = 'today' | 'week' | 'month' | 'all'
function rangeStart(range: Range): number {
  const d = new Date()
  if (range === 'today') {
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (range === 'week') {
    d.setDate(d.getDate() - 6)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  if (range === 'month') {
    d.setDate(d.getDate() - 29)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  return 0
}

// Report modal: total per project (and per feature) over a date range.
function showReport(): void {
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal report-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  modal.insertAdjacentHTML('beforeend', '<h2>Time report</h2>')

  let range: Range = 'week'
  const chipsRow = document.createElement('div')
  chipsRow.className = 'report-chips'
  const body = document.createElement('div')
  body.className = 'report-body'
  modal.append(chipsRow, body)

  const render = (): void => {
    chipsRow.replaceChildren()
    ;(['today', 'week', 'month', 'all'] as Range[]).forEach((r) => {
      const c = document.createElement('button')
      c.className = 'report-chip' + (r === range ? ' active' : '')
      c.textContent = r === 'today' ? 'Today' : r === 'week' ? '7 days' : r === 'month' ? '30 days' : 'All'
      c.addEventListener('click', () => {
        range = r
        render()
      })
      chipsRow.appendChild(c)
    })

    const from = rangeStart(range)
    const byProj = new Map<string, { total: number; feats: Map<string, number> }>()
    for (const e of settings.timeEntries) {
      if (e.end < from) continue
      let p = byProj.get(e.projectPath)
      if (!p) {
        p = { total: 0, feats: new Map() }
        byProj.set(e.projectPath, p)
      }
      const ms = e.end - e.start
      p.total += ms
      const fk = e.featureId ?? ''
      p.feats.set(fk, (p.feats.get(fk) ?? 0) + ms)
    }

    body.replaceChildren()
    if (!byProj.size) {
      body.insertAdjacentHTML('beforeend', '<div class="notif-empty">No time logged in this range</div>')
      return
    }
    let grand = 0
    for (const [path, info] of [...byProj].sort((a, b) => b[1].total - a[1].total)) {
      grand += info.total
      const proj = findProjectByPath(state.tree, path)
      const pr = document.createElement('div')
      pr.className = 'report-row report-proj'
      pr.innerHTML = `<span class="report-name">${proj?.name ?? path}</span><span class="report-dur">${fmtHM(info.total)}</span>`
      body.appendChild(pr)
      for (const [fid, ms] of [...info.feats].sort((a, b) => b[1] - a[1])) {
        const feat = fid ? findFeature(state.tree, fid)?.feature : null
        const fr = document.createElement('div')
        fr.className = 'report-row report-feat'
        fr.innerHTML = `<span class="report-name">${feat?.name ?? '(no feature)'}</span><span class="report-dur">${fmtHM(ms)}</span>`
        body.appendChild(fr)
      }
    }
    const tot = document.createElement('div')
    tot.className = 'report-row report-total'
    tot.innerHTML = `<span class="report-name">Total</span><span class="report-dur">${fmtHM(grand)}</span>`
    body.appendChild(tot)
  }
  render()
  document.body.appendChild(overlay)
}

// ---- automatic terminal-bound tracking ----

function closeAutoSession(): void {
  if (!autoSession) return
  const dur = Date.now() - autoSession.start
  if (dur >= 1000) {
    settings.timeEntries.push({
      id: uid('te'),
      projectPath: autoSession.projectPath,
      featureId: autoSession.featureId || undefined,
      start: autoSession.start,
      end: Date.now(),
      source: 'auto'
    })
    saveSoon()
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

// Bind a terminal to a project/feature for automatic time tracking.
export function openTrackModal(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  const modal = document.createElement('div')
  modal.className = 'modal track-modal'
  overlay.appendChild(modal)
  const close = (): void => overlay.remove()
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close()
  })
  modal.appendChild(makeCloseButton(close))
  modal.insertAdjacentHTML('beforeend', '<h2>Track time for this terminal</h2>')

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Project</div>')
  const proj = document.createElement('select')
  proj.className = 'settings-select'
  proj.style.width = '100%'
  const projects = flattenProjects(state.tree)
  if (!projects.length) proj.insertAdjacentHTML('beforeend', '<option value="">(no projects)</option>')
  for (const p of projects) {
    const o = document.createElement('option')
    o.value = p.path
    o.textContent = p.name
    if (p.path === pane.trackProjectPath) o.selected = true
    proj.appendChild(o)
  }
  modal.appendChild(proj)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Feature</div>')
  const feat = document.createElement('select')
  feat.className = 'settings-select'
  feat.style.width = '100%'
  const fillFeatures = (): void => {
    feat.replaceChildren()
    feat.insertAdjacentHTML('beforeend', '<option value="">(no feature)</option>')
    const owner = proj.value ? findProjectByPath(state.tree, proj.value) : null
    for (const f of owner?.features ?? []) {
      const o = document.createElement('option')
      o.value = f.id
      o.textContent = f.name
      if (f.id === pane.trackFeatureId) o.selected = true
      feat.appendChild(o)
    }
  }
  fillFeatures()
  proj.addEventListener('change', fillFeatures)
  modal.appendChild(feat)

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  if (pane.trackProjectPath) {
    const stop = document.createElement('button')
    stop.textContent = 'Stop tracking'
    stop.addEventListener('click', () => {
      pane.trackProjectPath = null
      pane.trackFeatureId = null
      updatePaneStatus(pane)
      close()
    })
    actions.appendChild(stop)
  }
  const save = document.createElement('button')
  save.className = 'primary'
  save.textContent = 'Track'
  save.addEventListener('click', () => {
    if (!proj.value) return
    pane.trackProjectPath = proj.value
    pane.trackFeatureId = feat.value || null
    updatePaneStatus(pane)
    close()
  })
  actions.append(save)
  modal.appendChild(actions)
  document.body.appendChild(overlay)
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
  document.querySelectorAll<HTMLButtonElement>('.time-pom-preset').forEach((b) => {
    b.addEventListener('click', () => startPomodoro(Number(b.dataset.min) * 60_000))
  })
  el('time-report-btn').addEventListener('click', showReport)
}
