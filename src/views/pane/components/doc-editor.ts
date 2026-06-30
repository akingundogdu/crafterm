import { el } from '@views/lib/dom'

// The raw-text editor (textarea) of a doc pane. Hidden until edit mode is
// entered. Pure view; the caller wires keydown (Cmd+S) and value sync.
export function createDocEditor(): HTMLTextAreaElement {
  const editor = el('textarea', { class: 'doc-editor', style: 'display: none' })
  editor.spellcheck = false
  return editor
}
