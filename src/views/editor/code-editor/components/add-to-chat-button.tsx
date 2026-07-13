import { Component } from '@geajs/core'

// "Add to Chat ⌘L" button for the selection action bar. The mousedown preventer
// blocks the selection-collapsing default; the ⌘L combo is bound in state
// alongside. Rendered as a JSX child of the selection-actions view.
export default class AddToChatButton extends Component {
  declare props: { onAddToChat: (e: Event) => void; preventCollapse: (e: Event) => void }

  template({ onAddToChat, preventCollapse }: this['props']) {
    return (
      <button class="code-editor-button" onMouseDown={preventCollapse} onClick={onAddToChat}>
        Add to Chat ⌘L
      </button>
    )
  }
}
