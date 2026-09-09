import { exitSideBySide, addSideBySideTab } from '../content.store'
import { clearMultiSelect, markMultiSelected } from '@views/screens/sidebar/sidebar.store'
import { newTabBesideActive, selectPane } from '@views/commands/commands'
import { state, renderContent, requestSidebar } from '@views/state/spine'

// The strip above a side-by-side view (todomraex8usk1).

export const EXIT_LABEL = 'Exit'
export const EXIT_TITLE = 'Back to the single-terminal view'
export const ADD_TERMINAL_LABEL = '+ Terminal'
export const ADD_TERMINAL_TITLE = 'Open a new terminal next to the active one and add it to this view'
export const ADD_CLAUDE_LABEL = '+ Claude'
export const ADD_CLAUDE_TITLE = 'Open a new Claude session next to the active terminal and add it to this view'

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

// Grow the view: a new terminal (or Claude session) opens where the active tile
// is — same sidebar group, same cwd — becomes a tile right of that one, gets
// marked in the sidebar like the others, and takes focus. The active pane is read
// before creating: creation makes the new pane active.
export async function addToSideBySide(claude: boolean): Promise<void> {
  const beside = state.activePaneId
  const created = await newTabBesideActive(claude)
  if (!created) return
  addSideBySideTab(created.tab.id, beside)
  markMultiSelected(created.tab.id)
  renderContent()
  requestSidebar()
  selectPane(created.paneId)
}
