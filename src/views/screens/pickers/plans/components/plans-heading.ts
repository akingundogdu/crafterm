import { el } from '@views/lib/dom'
import { UITexts } from '@texts'

// Appends the heading, and (when there are no plans) the empty hint.
// Returns true when the modal is empty so the caller can stop early.
export function appendPlansHeading(modal: HTMLElement, isEmpty: boolean): boolean {
  modal.appendChild(el('h2', null, UITexts.Pickers.plans.heading))
  if (isEmpty) {
    modal.appendChild(el('div', { class: 'empty-hint' }, 'No plans in ~/.claude/plans'))
    return true
  }
  return false
}
