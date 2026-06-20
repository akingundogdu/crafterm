import type { SelectionActionsHandlers } from '../code-editor.types'
import { makeSelectionActionHandlers } from '../code-editor.state'

// Floating Cursor-style action bar shown above a non-empty selection. Pure view:
// a single declarative tree whose buttons bind handlers prepared by state. Monaco
// content-widget positioning lives in `mountSelectionActions` (state).
export function createSelectionActions(handlers: SelectionActionsHandlers): HTMLDivElement {
  const h = makeSelectionActionHandlers(handlers)
  return (
    <div class="code-editor-selection-actions" style="display: none">
      {h.onCopy && (
        <button class="code-editor-button" onMousedown={h.preventCollapse} onClick={h.onCopy}>
          Copy
        </button>
      )}
      {h.onAddToChat && (
        <button class="code-editor-button" onMousedown={h.preventCollapse} onClick={h.onAddToChat}>
          Add to Chat ⌘L
        </button>
      )}
    </div>
  ) as HTMLDivElement
}
