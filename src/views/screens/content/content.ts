import './content.css'
import { contentController } from './content.controller'

export function updatePaneHighlight(): void {
  contentController.updatePaneHighlight()
}

export function renderContent(): void {
  contentController.renderContent()
}
