import { Component } from '@geajs/core'

// The rendered-markdown preview surface of a doc pane. Pure view; the caller
// sets innerHTML via renderMarkdown and toggles display against the editor.
class MarkdownPreview extends Component {
  template() {
    return <div class="doc-preview" />
  }
}

export function createMarkdownPreview(): HTMLDivElement {
  const host = document.createElement('div')
  new MarkdownPreview().render(host)
  return host.firstElementChild as HTMLDivElement
}
