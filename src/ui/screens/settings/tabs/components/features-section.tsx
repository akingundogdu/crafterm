import { persistence } from '@repositories/persistence.service'
import type { ProjectNode } from '@ui/types/types'

interface FeaturesSectionProps {
  project: ProjectNode
  parent: HTMLElement
  uid: (prefix: string) => string
  renderTree: () => void
  renderDetail: () => void
}

// The Features section: time-tracking labels under this project (used by
// the Time tracker dropdown). Just name + delete; the data also drives the
// sidebar "New feature…" wizard.
export function buildFeaturesSection(props: FeaturesSectionProps): void {
  const { project: p, parent, uid, renderTree, renderDetail } = props
  parent.insertAdjacentHTML('beforeend', '<div class="settings-subhead">Features</div>')
  p.features = p.features ?? []
  if (!p.features.length) {
    parent.insertAdjacentHTML(
      'beforeend',
      '<div class="field-hint">No features. Add labels to track time against, or for the New-feature wizard.</div>'
    )
  }
  p.features.forEach((feat) => {
    const input = (<input type="text" placeholder="feature name" />) as HTMLInputElement
    input.value = feat.name
    input.addEventListener('change', () => {
      feat.name = input.value.trim() || feat.name
      persistence.save()
    })
    input.addEventListener('keydown', (e) => e.stopPropagation())
    const del = (
      <button class="feat-del" title="Remove feature">
        ✕
      </button>
    ) as HTMLButtonElement
    del.addEventListener('click', () => {
      p.features = (p.features ?? []).filter((f) => f !== feat)
      persistence.save()
      renderTree()
      renderDetail()
    })
    const row = (
      <div class="feat-row">
        {input}
        {del}
      </div>
    ) as HTMLDivElement
    parent.appendChild(row)
  })

  const add = (<button class="settings-inline-btn">+ Add feature</button>) as HTMLButtonElement
  add.addEventListener('click', () => {
    p.features = p.features ?? []
    p.features.push({ id: uid('ft'), name: 'feature' })
    persistence.save()
    renderDetail()
  })
  parent.appendChild(add)
}
