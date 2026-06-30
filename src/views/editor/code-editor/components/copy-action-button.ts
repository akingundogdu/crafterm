import { el } from '@views/lib/dom'

// "Copy" button for the selection action bar. Rendered only when a copy handler
// was prepared. The mousedown preventer blocks the selection-collapsing default;
// the click handler (prepared by state) copies and flashes a "Copied" label.
export function createCopyActionButton(
  onCopy: (e: Event) => void,
  preventCollapse: (e: Event) => void
): HTMLButtonElement {
  return el(
    'button',
    { class: 'code-editor-button', onMousedown: preventCollapse, onClick: onCopy },
    'Copy'
  )
}
