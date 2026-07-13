import { Component } from '@geajs/core'
import { persistence } from '@repositories/persistence.service'
import { makeRefreshChip, flushSave } from '../settings.store'

// gea footer holding the save-status chip + a manual "Save now" flush button.
// One-shot builder (rebuilt when the modal opens), so no reactive store is needed —
// the markup is static and the chip refresher is wired imperatively in the factory.
class SaveChipFooter extends Component {
  template() {
    return (
      <div class="settings-save-footer">
        <span class="settings-save-chip" />
        <button class="settings-inline-btn" onClick={flushSave}>
          Save now
        </button>
      </div>
    )
  }
}

// Builds the footer save-status chip + manual "Save now" flush button, subscribes
// the chip refresher to persistence, and returns the footer element + the
// unsubscribe cleanup the modal runs on close. Signature preserved so settings.ts
// resolves unchanged.
export function createSaveChip(): { footer: HTMLDivElement; cleanup: () => void } {
  const host = document.createElement('div')
  new SaveChipFooter().render(host)
  const footer = host.firstElementChild as HTMLDivElement
  const chip = footer.querySelector('.settings-save-chip') as HTMLSpanElement

  const refreshChip = makeRefreshChip(chip)
  refreshChip()
  const cleanup = persistence.subscribe(refreshChip)
  return { footer, cleanup }
}
