import { el } from '@views/lib/dom'
import { persistence } from '@repositories/persistence.service'
import { makeRefreshChip, flushSave } from '../settings.state'

// Builds the footer save-status chip + manual "Save now" flush button, subscribes
// the chip refresher to persistence, and returns the footer element + the
// unsubscribe cleanup the modal runs on close.
export function createSaveChip(): { footer: HTMLDivElement; cleanup: () => void } {
  const chip = el('span', { class: 'settings-save-chip' })
  const saveBtn = el('button', { class: 'settings-inline-btn', onClick: flushSave }, 'Save now')
  const footer = el('div', { class: 'settings-save-footer' }, chip, saveBtn)

  const refreshChip = makeRefreshChip(chip)
  refreshChip()
  const cleanup = persistence.subscribe(refreshChip)
  return { footer, cleanup }
}
