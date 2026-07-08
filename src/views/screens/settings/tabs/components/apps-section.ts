import AppsSection, { type AppsSectionDeps } from './apps-section-view'
import store from './apps-section.store'

export interface AppsSectionProps extends AppsSectionDeps {
  projectId: string
  parent: HTMLElement
}

// The Applications section of the selected project's editor: seed the reactive
// store from the project's applications, then mount the gea AppsSection view into
// the sub-tab panel host. The store drives the view; there is no separate manager.
export function buildAppsSection(props: AppsSectionProps): void {
  store.reload(props.projectId)
  new AppsSection({
    environments: props.environments,
    uid: props.uid,
    renderTree: props.renderTree
  }).render(props.parent)
}
