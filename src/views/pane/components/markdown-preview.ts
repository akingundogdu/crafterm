import { el } from '@views/lib/dom'

// The rendered-markdown preview surface of a doc pane. Pure view; the caller
// sets innerHTML via renderMarkdown and toggles display against the editor.
export function createMarkdownPreview(): HTMLDivElement {
  return el('div', { class: 'doc-preview' })
}
