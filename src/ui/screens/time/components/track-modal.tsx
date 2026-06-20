import { createOverlay, createSelect, createButton } from '@ui/components'
import { makeCloseButton } from '@ui/components/dialog/dialog'
import { state, panes } from '@ui/state/state'
import { flattenProjects, findProjectByPath } from '@ui/catalog/catalog'
import { UITexts } from '@texts'
import { makeStopTracking, makeTrack } from './track-modal.state'

// Bind a terminal to a project/feature for automatic time tracking.
export function openTrackModal(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const ov = createOverlay({ closeOnBackdrop: true })

  const projects = flattenProjects(state.tree)
  const proj = projects.length
    ? createSelect({
        options: projects.map((p) => ({ value: p.path, label: p.name })),
        value: pane.trackProjectPath ?? undefined
      })
    : createSelect({ options: [], emptyLabel: '(no projects)' })
  proj.className = 'settings-select'
  proj.style.width = '100%'

  // The feature list depends on the selected project, so rebuild + swap the
  // <select> whenever the project changes (createSelect is otherwise static).
  const buildFeatureSelect = (): HTMLSelectElement => {
    const owner = proj.value ? findProjectByPath(state.tree, proj.value) : null
    const s = createSelect({
      options: (owner?.features ?? []).map((f) => ({ value: f.id, label: f.name })),
      emptyLabel: UITexts.Time.noFeature,
      value: pane.trackFeatureId ?? ''
    })
    s.className = 'settings-select'
    s.style.width = '100%'
    return s
  }
  let feat = buildFeatureSelect()
  proj.addEventListener('change', () => {
    const next = buildFeatureSelect()
    feat.replaceWith(next)
    feat = next
  })

  const actions = (<div class="modal-actions" />) as HTMLDivElement
  if (pane.trackProjectPath) {
    actions.appendChild(
      createButton({
        text: UITexts.Time.trackModal.stopTracking,
        onClick: makeStopTracking(pane, ov.close)
      })
    )
  }
  actions.appendChild(
    createButton({
      text: UITexts.Time.trackModal.track,
      variant: 'primary',
      onClick: makeTrack(
        pane,
        () => proj.value,
        () => feat.value,
        ov.close
      )
    })
  )

  const modal = (
    <div class="modal track-modal">
      {makeCloseButton(ov.close)}
      <h2>{UITexts.Time.trackModal.title}</h2>
      <div class="reminder-label">{UITexts.Time.trackModal.project}</div>
      {proj}
      <div class="reminder-label">{UITexts.Time.trackModal.feature}</div>
      {feat}
      {actions}
    </div>
  ) as HTMLDivElement

  ov.overlay.appendChild(modal)
  ov.mount()
}
