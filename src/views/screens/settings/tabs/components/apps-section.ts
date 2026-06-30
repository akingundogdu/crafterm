import { AppsSectionController, type AppsSectionProps } from './apps-section.controller'

// The Applications section of the selected project's editor.
export function buildAppsSection(props: AppsSectionProps): void {
  new AppsSectionController(props).build()
}
