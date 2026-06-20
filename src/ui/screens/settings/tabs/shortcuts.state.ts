import { persistence } from '@repositories/persistence.service'
import {
  comboFromEvent,
  setBinding,
  resetBinding,
  isModifierKey
} from '@ui/keybindings/keybindings'

// Reset handler for one action: clears the override, persists, re-renders.
export function makeResetBinding(id: string, rerender: () => void): () => void {
  return () => {
    resetBinding(id)
    persistence.save()
    rerender()
  }
}

// Interprets a keydown captured while recording a shortcut:
// - 'cancel'  → Escape (abort capture)
// - 'commit'  → a valid Cmd combo was bound + persisted
// - 'ignore'  → a bare modifier or a combo without Cmd (keep waiting)
export function applyRecordedKey(id: string, e: KeyboardEvent): 'cancel' | 'commit' | 'ignore' {
  if (e.key === 'Escape') return 'cancel'
  e.preventDefault()
  e.stopPropagation()
  if (isModifierKey(e.key)) return 'ignore'
  const combo = comboFromEvent(e)
  if (!combo) return 'ignore'
  setBinding(id, combo)
  persistence.save()
  return 'commit'
}
