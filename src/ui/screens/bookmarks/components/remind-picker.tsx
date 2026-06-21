import { createOverlay } from '@ui/components'
import type { Bookmark } from '@ui/types/types'
import { createSnoozeChips } from './snooze-chips'
import { createPickerShell } from './picker-shell'

// Quick "remind me about this bookmark" picker: one chip per snooze option.
// Uses a bare overlay (no Cancel/OK action row) to match the original modal.
export function showRemindPicker(bm: Bookmark): void {
  const ov = createOverlay({ closeOnBackdrop: true })

  const chips = createSnoozeChips(bm, ov.close)
  const modal = createPickerShell(bm.title, chips, ov.close)

  ov.overlay.appendChild(modal)
  ov.mount()
}
