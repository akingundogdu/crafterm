import { createOverlay, createSelect, createButton } from '@crafterm/ui'
import { makeCloseButton } from '../../../dialog'
import { state, panes } from '../../../state'
import { flattenProjects, findProjectByPath } from '../../../catalog'
import { updatePaneStatus } from '../../../pane'

// Bind a terminal to a project/feature for automatic time tracking.
export function openTrackModal(paneId: string): void {
  const pane = panes.get(paneId)
  if (!pane) return
  const ov = createOverlay({ closeOnBackdrop: true })
  const modal = document.createElement('div')
  modal.className = 'modal track-modal'
  ov.overlay.appendChild(modal)
  modal.appendChild(makeCloseButton(ov.close))
  modal.insertAdjacentHTML('beforeend', '<h2>Track time for this terminal</h2>')

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Project</div>')
  const projects = flattenProjects(state.tree)
  const proj = projects.length
    ? createSelect({
        options: projects.map((p) => ({ value: p.path, label: p.name })),
        value: pane.trackProjectPath ?? undefined
      })
    : createSelect({ options: [], emptyLabel: '(no projects)' })
  proj.className = 'settings-select'
  proj.style.width = '100%'
  modal.appendChild(proj)

  modal.insertAdjacentHTML('beforeend', '<div class="reminder-label">Feature</div>')
  // The feature list depends on the selected project, so rebuild + swap the
  // <select> whenever the project changes (createSelect is otherwise static).
  const buildFeatureSelect = (): HTMLSelectElement => {
    const owner = proj.value ? findProjectByPath(state.tree, proj.value) : null
    const s = createSelect({
      options: (owner?.features ?? []).map((f) => ({ value: f.id, label: f.name })),
      emptyLabel: '(no feature)',
      value: pane.trackFeatureId ?? ''
    })
    s.className = 'settings-select'
    s.style.width = '100%'
    return s
  }
  let feat = buildFeatureSelect()
  modal.appendChild(feat)
  proj.addEventListener('change', () => {
    const next = buildFeatureSelect()
    feat.replaceWith(next)
    feat = next
  })

  const actions = document.createElement('div')
  actions.className = 'modal-actions'
  if (pane.trackProjectPath) {
    actions.appendChild(
      createButton({
        text: 'Stop tracking',
        onClick: () => {
          pane.trackProjectPath = null
          pane.trackFeatureId = null
          updatePaneStatus(pane)
          ov.close()
        }
      })
    )
  }
  actions.appendChild(
    createButton({
      text: 'Track',
      variant: 'primary',
      onClick: () => {
        if (!proj.value) return
        pane.trackProjectPath = proj.value
        pane.trackFeatureId = feat.value || null
        updatePaneStatus(pane)
        ov.close()
      }
    })
  )
  modal.appendChild(actions)
  ov.mount()
}
