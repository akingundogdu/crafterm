import { Component } from '@geajs/core'
import { state } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { findProjectById } from '@views/catalog/catalog'
import type { ProjectNode } from '@views/types/types'
import FeatureRow from './feature-row'
import store from './features-section.store'

export interface FeaturesSectionDeps {
  uid: (prefix: string) => string
  renderTree: () => void
}

// Reactive body of the project Features section: heading, empty hint, one FeatureRow
// per feature, and "+ Add feature". Rendered as a JSX child of FeaturesSection so gea
// tracks its `store.features` read and re-renders on add / remove / rename. Every
// mutation resolves the RAW project node (§gea 5.3), reassigns its features, persists,
// then reloads the store. Delete also refreshes the tree (mirrors the legacy renderTree
// call on removal).
class FeaturesBody extends Component {
  declare props: { deps: FeaturesSectionDeps }

  private raw(): ProjectNode | null {
    return findProjectById(state.tree, store.projectId)
  }

  private add = (): void => {
    const p = this.raw()
    if (!p) return
    p.features = [...(p.features ?? []), { id: this.props.deps.uid('ft'), name: 'feature' }]
    persistence.save()
    store.reload(store.projectId)
  }

  private nameChange = (featId: string, v: string): void => {
    const p = this.raw()
    const feat = p?.features?.find((f) => f.id === featId)
    if (!p || !feat) return
    feat.name = v.trim() || feat.name
    persistence.save()
  }

  private del = (featId: string): void => {
    const p = this.raw()
    if (!p) return
    p.features = (p.features ?? []).filter((f) => f.id !== featId)
    persistence.save()
    store.reload(store.projectId)
    this.props.deps.renderTree()
  }

  template() {
    const features = store.features
    return (
      <div style={{ display: 'contents' }}>
        <div class="settings-subhead">Features</div>
        {features.length === 0 && (
          <div class="field-hint">No features. Add labels to track time against, or for the New-feature wizard.</div>
        )}
        {features.map((feat) => (
          <FeatureRow
            key={feat.id}
            name={feat.name}
            onNameChange={(v: string) => this.nameChange(feat.id, v)}
            onDelete={() => this.del(feat.id)}
          />
        ))}
        <button class="settings-inline-btn" onClick={this.add}>
          + Add feature
        </button>
      </div>
    )
  }
}

// Thin shell for the Features section, mounted imperatively into its sub-tab panel
// host; `deps` arrive via the constructor. Reactive markup lives in FeaturesBody
// (display:contents root → §gea 5.8).
export default class FeaturesSection extends Component {
  private readonly deps: FeaturesSectionDeps

  constructor(deps: FeaturesSectionDeps) {
    super()
    this.deps = deps
  }

  template() {
    return <FeaturesBody deps={this.deps} />
  }
}
