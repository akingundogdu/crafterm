import { Component } from '@geajs/core'

// "Copy" button for the selection action bar. The mousedown preventer blocks the
// selection-collapsing default; the click handler (prepared by state) copies and
// flashes a "Copied" label. Rendered as a JSX child of the selection-actions view.
export default class CopyActionButton extends Component {
  declare props: { onCopy: (e: Event) => void; preventCollapse: (e: Event) => void }

  template({ onCopy, preventCollapse }: this['props']) {
    return (
      <button class="code-editor-button" onMouseDown={preventCollapse} onClick={onCopy}>
        Copy
      </button>
    )
  }
}
