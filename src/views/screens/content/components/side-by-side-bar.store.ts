import { exitSideBySide } from '../content.store'
import { clearMultiSelect } from '@views/screens/sidebar/sidebar.store'
import { renderContent, requestSidebar } from '@views/state/spine'

// The strip above a side-by-side view (todomraex8usk1).

export const EXIT_LABEL = 'Exit'
export const EXIT_TITLE = 'Back to the single-terminal view'

export function sideBySideTitle(count: number): string {
  return `${count} terminals side by side`
}

// Leave the view: the panes go back to their own tabs and the sidebar drops its
// marks. Nothing was moved, so there is nothing to undo beyond re-rendering.
export function leaveSideBySide(): void {
  exitSideBySide()
  clearMultiSelect()
  renderContent()
  requestSidebar()
}
