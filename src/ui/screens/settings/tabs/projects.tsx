import { ProjectsPanelController } from './projects.controller'

export function buildProjectsPanel(panel: HTMLElement): void {
  new ProjectsPanelController(panel).build()
}
