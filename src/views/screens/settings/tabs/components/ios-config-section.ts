import { IosConfigSectionController } from './ios-config-section.controller'

export function buildIosConfigSection(projectId: string, panel: HTMLElement): void {
  new IosConfigSectionController(projectId, panel).build()
}
