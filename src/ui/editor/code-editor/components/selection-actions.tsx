import type { SelectionActionsHandlers } from '../code-editor.types'
import { makeSelectionActionHandlers } from '../code-editor.state'
import { createCopyActionButton } from './copy-action-button'
import { createAddToChatButton } from './add-to-chat-button'

// Floating Cursor-style action bar shown above a non-empty selection. Pure view:
// a single declarative tree whose buttons (extracted into siblings) bind handlers
// prepared by state. Monaco content-widget positioning lives in
// `mountSelectionActions` (state).
export function createSelectionActions(handlers: SelectionActionsHandlers): HTMLDivElement {
  const h = makeSelectionActionHandlers(handlers)
  return (
    <div class="code-editor-selection-actions" style="display: none">
      {h.onCopy && createCopyActionButton(h.onCopy, h.preventCollapse)}
      {h.onAddToChat && createAddToChatButton(h.onAddToChat, h.preventCollapse)}
    </div>
  ) as HTMLDivElement
}
