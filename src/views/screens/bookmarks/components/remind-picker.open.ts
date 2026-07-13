import { createOverlay } from '@views/components/overlay/overlay'
import type { Bookmark } from '@views/types/types'
import RemindPicker from './remind-picker'

// Opens the gea bookmark remind picker: a @views overlay backdrop with the gea
// RemindPicker body mounted inside. A bare overlay (no Cancel/OK row) matches the
// original modal. Self-contained — no @ui (§2.7).
export function showRemindPicker(bm: Bookmark): void {
  const ov = createOverlay({ closeOnBackdrop: true })
  new RemindPicker({ bookmark: bm, onClose: () => ov.close() }).render(ov.overlay)
  ov.mount()
}
