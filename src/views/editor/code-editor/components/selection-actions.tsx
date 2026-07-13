import { Component } from '@geajs/core'
import type { SelectionActionsHandlers } from '../code-editor.types'
import { makeSelectionActionHandlers } from '../code-editor.store'
import CopyActionButton from './copy-action-button'
import AddToChatButton from './add-to-chat-button'

// Floating Cursor-style action bar shown above a non-empty selection. The buttons
// are JSX children (inline conditionals — a pre-built node embedded via `{expr}`
// renders as an empty comment under gea). Monaco content-widget positioning lives
// in `mountSelectionActions` (state). Mounted imperatively, so the handlers arrive
// via the constructor into a plain field.
class SelectionActionsView extends Component {
  private readonly h: ReturnType<typeof makeSelectionActionHandlers>

  constructor(opts: { handlers: SelectionActionsHandlers }) {
    super()
    this.h = makeSelectionActionHandlers(opts.handlers)
  }

  template() {
    const h = this.h
    return (
      <div class="code-editor-selection-actions" style={{ display: 'none' }}>
        {h.onCopy ? <CopyActionButton onCopy={h.onCopy} preventCollapse={h.preventCollapse} /> : null}
        {h.onAddToChat ? (
          <AddToChatButton onAddToChat={h.onAddToChat} preventCollapse={h.preventCollapse} />
        ) : null}
      </div>
    )
  }
}

export function createSelectionActions(handlers: SelectionActionsHandlers): HTMLDivElement {
  const host = document.createElement('div')
  new SelectionActionsView({ handlers }).render(host)
  return host.firstElementChild as HTMLDivElement
}
