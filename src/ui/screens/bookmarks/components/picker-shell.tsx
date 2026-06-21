import { UITexts } from '@texts'
import { makeCloseButton } from '@ui/components/dialog/dialog'

export function createPickerShell(hint: string, chips: HTMLElement, close: () => void): HTMLElement {
  return (
    <div class="modal modal-prompt">
      {makeCloseButton(close)}
      <h2>{UITexts.Reminders.remindModalTitle}</h2>
      <div class="field-hint">{hint}</div>
      {chips}
    </div>
  ) as HTMLDivElement
}
