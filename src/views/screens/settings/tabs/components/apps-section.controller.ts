import AppsSection, { type AppsSectionDeps } from './apps-section-view'
import store from './apps-section.store'

export interface AppsSectionProps extends AppsSectionDeps {
  projectId: string
  parent: HTMLElement
}

// The Applications section of the selected project's editor. Holds no DOM building
// itself: it seeds the reactive store from the project's applications, then mounts the
// gea AppsSection view into the sub-tab panel host. Class + build() preserved so the
// apps-section barrel resolves unchanged.
export class AppsSectionController {
  private readonly props: AppsSectionProps

  constructor(props: AppsSectionProps) {
    this.props = props
  }

  build(): void {
    store.reload(this.props.projectId)
    new AppsSection({
      environments: this.props.environments,
      uid: this.props.uid,
      renderTree: this.props.renderTree
    }).render(this.props.parent)
  }
}
