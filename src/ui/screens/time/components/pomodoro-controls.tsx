import { uid, state } from '@ui/state/state'
import { persistence } from '@repositories/persistence.service'
import { promptText } from '@ui/components/dialog/dialog'
import { findProjectByPath } from '@ui/catalog/catalog'
import { UITexts } from '@texts'
import { projectSel } from './project-selector'
import { featureSel, renderFeatures } from './feature-selector'
import { startPomodoro } from '../time.engine'

function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}

export async function addFeature(): Promise<void> {
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

// Wire the pomodoro preset buttons + the custom-length countdown input.
export function initPomodoroControls(): void {
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
}
