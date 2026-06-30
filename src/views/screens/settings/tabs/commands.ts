import { CommandsPanelController } from './commands.controller'

export function buildCommandsPanel(panel: HTMLElement): void {
  new CommandsPanelController(panel).build()
}
