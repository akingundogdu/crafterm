import { el } from '@views/lib/dom'
import { persistence } from '@repositories/persistence.service'
import type { ProjectNode } from '@views/types/types'

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
    const input = el('input', {
      type: 'text',
      placeholder: 'feature name',
      onChange: () => {
        feat.name = input.value.trim() || feat.name
        persistence.save()
      },
      onKeydown: (e: KeyboardEvent) => e.stopPropagation()
    })
    input.value = feat.name
    const del = el(
      'button',
      {
        class: 'feat-del',
        title: 'Remove feature',
        onClick: () => {
          p.features = (p.features ?? []).filter((f) => f !== feat)
          persistence.save()
          renderTree()
          renderDetail()
        }
      },
      '✕'
    )
    parent.appendChild(el('div', { class: 'feat-row' }, input, del))
  })

  const add = el(
    'button',
    {
      class: 'settings-inline-btn',
      onClick: () => {
        p.features = p.features ?? []
        p.features.push({ id: uid('ft'), name: 'feature' })
        persistence.save()
        renderDetail()
      }
    },
    '+ Add feature'
  )
  parent.appendChild(add)
}
