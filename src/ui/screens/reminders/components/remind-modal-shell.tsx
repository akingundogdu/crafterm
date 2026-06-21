import { UITexts } from '@texts'
import { makeCloseButton } from '@ui/components/dialog/dialog'

export function createRemindModalShell(subject: string, chips: HTMLElement, close: () => void): HTMLElement {
  return (
    <div class="modal modal-prompt">
      {makeCloseButton(close)}
      <h2>{UITexts.Reminders.remindModalTitle}</h2>
      <div class="field-hint">{subject}</div>
      {chips}
    </div>
  ) as HTMLDivElement
}
