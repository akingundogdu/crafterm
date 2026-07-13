import IosConfigSection from './ios-config-section-view'
import store from './ios-config-section.store'

// The per-project iOS section: seed the reactive store (iosApp toggle + copy-files
// list) from the project, then mount the gea IosConfigSection view into the sub-tab
// panel host. The store drives the view; there is no separate manager.
export function buildIosConfigSection(projectId: string, panel: HTMLElement): void {
  store.reload(projectId)
  new IosConfigSection().render(panel)
}
