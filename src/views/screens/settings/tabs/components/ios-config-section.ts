import type { ProjectNode } from '@views/types/types'
import { IosConfigSectionController } from './ios-config-section.controller'

export function buildIosConfigSection(p: ProjectNode, panel: HTMLElement): void {
  new IosConfigSectionController(p, panel).build()
}
