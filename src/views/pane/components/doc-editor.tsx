import { Component } from '@geajs/core'

// The raw-text editor (textarea) of a doc pane. Hidden until edit mode is
// entered. Pure view; the caller wires keydown (Cmd+S) and value sync.
// `spellcheck` is a string attribute (a JSX `false` value is dropped by the runtime).
class DocEditor extends Component {
  template() {
    return <textarea class="doc-editor" spellcheck="false" style="display: none" />
  }
}

export function createDocEditor(): HTMLTextAreaElement {
  const host = document.createElement('div')
  new DocEditor().render(host)
  return host.firstElementChild as HTMLTextAreaElement
}
