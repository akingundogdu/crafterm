import IosConfigSection from './ios-config-section-view'
import store from './ios-config-section.store'

// The per-project iOS section. Holds no DOM building itself: it seeds the reactive
// store (iosApp toggle + copy-files list) from the project, then mounts the gea
// IosConfigSection view into the sub-tab panel host. Class + build() preserved so the
// ios-config-section barrel resolves unchanged.
export class IosConfigSectionController {
  private readonly projectId: string
  private readonly panel: HTMLElement

  constructor(projectId: string, panel: HTMLElement) {
    this.projectId = projectId
    this.panel = panel
  }

  build(): void {
    store.reload(this.projectId)
    new IosConfigSection().render(this.panel)
  }
}
