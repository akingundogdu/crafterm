import './content.css'
import '@ui/popout/popout.css'
import { contentController } from './content.controller'

export function updatePaneHighlight(): void {
  contentController.updatePaneHighlight()
}

export function renderContent(): void {
  contentController.renderContent()
}
