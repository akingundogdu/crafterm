import { UITexts } from '@texts'

// Appends the heading, and (when there are no plans) the empty hint.
// Returns true when the modal is empty so the caller can stop early.
export function appendPlansHeading(modal: HTMLElement, isEmpty: boolean): boolean {
  modal.appendChild(<h2>{UITexts.Pickers.plans.heading}</h2>)
  if (isEmpty) {
    modal.appendChild(<div class="empty-hint">No plans in ~/.claude/plans</div>)
    return true
  }
  return false
}
