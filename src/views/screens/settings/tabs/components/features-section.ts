import FeaturesSection from './features-section-view'
import store from './features-section.store'

export interface FeaturesSectionProps {
  projectId: string
  parent: HTMLElement
  uid: (prefix: string) => string
  renderTree: () => void
}

// The Features section: time-tracking labels under this project (used by the Time
// tracker dropdown). Seeds the reactive store from the project, then mounts the gea
// FeaturesSection view into the sub-tab panel host. Signature preserved shape (props
// factory) so the controller resolves unchanged.
export function buildFeaturesSection(props: FeaturesSectionProps): void {
  store.reload(props.projectId)
  new FeaturesSection({ uid: props.uid, renderTree: props.renderTree }).render(props.parent)
}
