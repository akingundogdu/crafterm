import { Store } from '@geajs/core'
import { state, settings, panes } from '@views/state/spine'
import shellStore from '@views/state/shell.store'
import { flattenProjects, findProjectByPath } from '@views/catalog/catalog'
import { uid } from '@views/lib/uid'
import { persistence } from '@repositories/persistence.service'
import { timeEntryRepo } from '@repositories'
import { appService, soundService } from '@services'
import { fmtHM, startOfToday, sumByProject, type OngoingSpan } from '@services/domain/time'
import { promptText } from '@views/components/dialog/prompt-text'
import { UITexts } from '@texts'
import type { Pane } from '@views/types/types'
import type { ActiveTimer, AutoSession } from './time.types'

export const IDLE_MS = 5 * 60_000 // no activity this long ⇒ stop auto-counting

// Log a tracked interval (if it ran at least a second) under the given source.
export function logInterval(
  session: { projectPath: string; featureId: string | null; start: number },
  source: 'manual' | 'pomodoro' | 'auto'
): void {
  const dur = Date.now() - session.start
  if (dur < 1000) return
  timeEntryRepo.upsert({
    id: uid('te'),
    projectPath: session.projectPath,
    featureId: session.featureId || undefined,
    start: session.start,
    end: Date.now(),
    source
  })
}

// Whether automatic tracking should run for `pane` right now: it must be tracked,
// the window focused, and either the user or the terminal recently active.
export function shouldTrackPane(pane: Pane | null | undefined, lastUserActivity: number): boolean {
  if (!pane?.trackProjectPath) return false
  const userActive = Date.now() - lastUserActivity < IDLE_MS
  const termActive = Date.now() - pane.lastActivity < IDLE_MS
  return document.hasFocus() && (userActive || termActive)
}

// A single Today-summary row: project name + formatted duration. `path` is the
// stable key for the keyed list in the view (§5.9).
export interface SummaryRow {
  path: string
  name: string
  dur: string
}

// gea store for the Time panel. Merges the legacy timer engine (manual + pomodoro)
// and the auto-tracking engine into one reactive singleton, plus the project/
// feature selection that legacy read from the DOM <select>s. Persisted time
// entries still flow through timeEntryRepo; the store mirrors live intervals into
// the reactive `now` tick so the elapsed clock + Today summary recompute. Self-
// contained — no @ui (§2.7).
class TimeStore extends Store {
  // Reactive UI state.
  now = Date.now()
  active: ActiveTimer | null = null
  autoSession: AutoSession | null = null
  selectedProject = ''
  selectedFeature = ''
  pomMin = ''
  pomRepeat = false

  // Non-rendered bookkeeping (read in methods only, never in the template).
  private ticker: number | null = null
  private lastUserActivity = Date.now()
  private autoStarted = false

  // Auto-pick the first project when nothing valid is selected (the legacy
  // <select> auto-selected its first option), and bump `now` so the summary +
  // clock reflect real time on (re)mount.
  ensureSelection(): void {
    // Resync the shell mirror so the project list + summary names reflect the live
    // tree at (re)mount, mirroring the legacy renderTime() re-read (the mirror can
    // otherwise lag on relaunch when no timer tick triggers a re-render).
    shellStore.reload()
    this.now = Date.now()
    const projects = flattenProjects(shellStore.tree)
    if (!projects.length) {
      this.selectedProject = ''
      this.selectedFeature = ''
      return
    }
    if (!projects.some((p) => p.path === this.selectedProject)) {
      this.selectedProject = projects[0].path
      this.selectedFeature = ''
    }
  }

  get projects() {
    return flattenProjects(shellStore.tree)
  }

  // Features of the currently selected project (empty when none / no project).
  get features() {
    const owner = this.selectedProject ? findProjectByPath(shellStore.tree, this.selectedProject) : null
    return owner?.features ?? []
  }

  get isRunning(): boolean {
    return this.active != null
  }

  // The elapsed/remaining clock string: pomodoro counts down, manual counts up,
  // idle shows zero. Reads `now` so the view re-renders each tick.
  get elapsedMs(): number {
    if (!this.active) return 0
    const elapsed = this.now - this.active.start
    return this.active.pomodoroMs ? Math.max(0, this.active.pomodoroMs - elapsed) : elapsed
  }

  setProject(v: string): void {
    this.selectedProject = v
    this.selectedFeature = ''
  }

  setFeature(v: string): void {
    this.selectedFeature = v
  }

  // Today's per-project totals, including the live manual + auto intervals.
  get summary(): SummaryRow[] {
    const now = this.now
    const ongoing: OngoingSpan[] = []
    if (this.active) ongoing.push({ projectPath: this.active.projectPath, ms: now - this.active.start })
    if (this.autoSession) ongoing.push({ projectPath: this.autoSession.projectPath, ms: now - this.autoSession.start })
    const byProj = sumByProject(timeEntryRepo.getAll(), startOfToday(now), ongoing)
    const rows: SummaryRow[] = []
    for (const [path, ms] of byProj) {
      const proj = findProjectByPath(shellStore.tree, path)
      rows.push({ path, name: proj?.name ?? path, dur: fmtHM(ms) })
    }
    return rows
  }

  private startTicker(): void {
    if (this.ticker) return
    this.ticker = window.setInterval(() => this.onTick(), 1000)
  }

  private clearTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker)
      this.ticker = null
    }
  }

  // Single timer loop: finish a due pomodoro, otherwise refresh the display.
  private onTick(): void {
    if (this.active?.pomodoroMs && Date.now() - this.active.start >= this.active.pomodoroMs) {
      this.finishPomodoro()
      return
    }
    this.now = Date.now()
  }

  // Log the active interval (if long enough) and clear the timer.
  private stopActive(): void {
    if (this.active) {
      logInterval(this.active, this.active.pomodoroMs ? 'pomodoro' : 'manual')
    }
    this.active = null
    this.clearTicker()
  }

  // Manual Start/Stop button.
  toggle(): void {
    if (this.active) {
      this.stopActive()
    } else {
      const projectPath = this.selectedProject
      if (!projectPath) return
      this.active = { projectPath, featureId: this.selectedFeature || null, start: Date.now() }
      this.startTicker()
    }
    this.now = Date.now()
  }

  // Start a countdown pomodoro for `ms`. `repeat` re-arms it after each finish.
  startPomodoro(ms: number, repeat = false): void {
    if (this.active) return
    const projectPath = this.selectedProject
    if (!projectPath) return
    this.active = {
      projectPath,
      featureId: this.selectedFeature || null,
      start: Date.now(),
      pomodoroMs: ms,
      repeat
    }
    this.startTicker()
    this.now = Date.now()
  }

  // Start the custom-length countdown from the minutes input (ignored if invalid).
  startCustomPomodoro(): void {
    const min = Number(this.pomMin)
    if (!Number.isFinite(min) || min <= 0) return
    this.startPomodoro(min * 60_000, this.pomRepeat)
  }

  // Pomodoro reached its end: log it, alert + sound, then re-arm if repeating.
  private finishPomodoro(): void {
    const proj = this.active ? findProjectByPath(state.tree, this.active.projectPath) : null
    const ms = this.active?.pomodoroMs
    const repeat = this.active?.repeat
    const projectPath = this.active?.projectPath
    const featureId = this.active?.featureId ?? null
    this.stopActive()
    appService.notify(
      UITexts.Time.pomodoroDoneTitle,
      UITexts.Time.pomodoroBody(proj?.name ?? UITexts.Time.sessionFallback)
    )
    if (settings.notifSound) soundService.play(settings.notifSound)
    // Re-arm the same countdown for repeating pomodoros (no project select needed).
    if (repeat && ms && projectPath) {
      this.active = { projectPath, featureId, start: Date.now(), pomodoroMs: ms, repeat: true }
      this.startTicker()
    }
    this.now = Date.now()
  }

  // Add a new feature to the selected project, persist, and select it.
  async addFeature(): Promise<void> {
    const projPath = this.selectedProject
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
    shellStore.reload()
    this.selectedFeature = f.id
  }

  private closeAutoSession(): void {
    if (!this.autoSession) return
    logInterval(this.autoSession, 'auto')
    this.autoSession = null
  }

  private autoTick(): void {
    const id = state.activePaneId
    const pane = id ? panes.get(id) : null
    if (shouldTrackPane(pane, this.lastUserActivity) && pane && id) {
      if (!this.autoSession || this.autoSession.paneId !== id) {
        this.closeAutoSession()
        this.autoSession = {
          paneId: id,
          projectPath: pane.trackProjectPath!,
          featureId: pane.trackFeatureId ?? null,
          start: Date.now()
        }
      }
    } else {
      this.closeAutoSession()
    }
    this.now = Date.now()
  }

  // Wire the global activity listeners + the auto-tracking loop (once).
  startAutoTracker(): void {
    if (this.autoStarted) return
    this.autoStarted = true
    document.addEventListener('mousemove', () => (this.lastUserActivity = Date.now()), true)
    document.addEventListener('keydown', () => (this.lastUserActivity = Date.now()), true)
    window.setInterval(() => this.autoTick(), 30_000)
  }
}

export default new TimeStore()
