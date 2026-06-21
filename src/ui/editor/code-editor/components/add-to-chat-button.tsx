// "Add to Chat ⌘L" button for the selection action bar. Rendered only when an
// add-to-chat handler was prepared. The mousedown preventer blocks the
// selection-collapsing default; the ⌘L combo is bound in state alongside.
export function createAddToChatButton(
  onAddToChat: (e: Event) => void,
  preventCollapse: (e: Event) => void
): HTMLButtonElement {
  return (
    <button class="code-editor-button" onMousedown={preventCollapse} onClick={onAddToChat}>
      Add to Chat ⌘L
    </button>
  ) as HTMLButtonElement
}
