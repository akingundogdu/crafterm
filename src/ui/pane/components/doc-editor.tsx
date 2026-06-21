// The raw-text editor (textarea) of a doc pane. Hidden until edit mode is
// entered. Pure view; the caller wires keydown (Cmd+S) and value sync.
export function createDocEditor(): HTMLTextAreaElement {
  return (
    <textarea
      class="doc-editor"
      style={{ display: 'none' }}
      ref={(el: HTMLTextAreaElement) => {
        el.spellcheck = false
      }}
    />
  ) as HTMLTextAreaElement
}
