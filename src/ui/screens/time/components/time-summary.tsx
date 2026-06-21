import { state } from '@ui/state/state'
import { findProjectByPath } from '@ui/catalog/catalog'
import { timeEntryRepo } from '@repositories'
import { fmtHM, startOfToday, sumByProject } from '@services/domain/time'
import type { ActiveTimer, AutoSession } from '../time.types'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

interface SummaryDeps {
  getActive: () => ActiveTimer | null
  getAutoSession: () => AutoSession | null
}

// Today's per-project totals, including any live manual + auto session intervals.
export function renderSummary({ getActive, getAutoSession }: SummaryDeps): void {
  const active = getActive()
  const autoSession = getAutoSession()
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
