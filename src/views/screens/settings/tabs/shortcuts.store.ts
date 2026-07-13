import { Store } from '@geajs/core'
import { settings } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import {
  KEYBINDINGS,
  effectiveCombo,
  comboLabel,
  setRecording,
  comboFromEvent,
  setBinding,
  resetBinding,
  isModifierKey
} from '../keybindings'

export interface ShortcutRowData {
  id: string
  label: string
  combo: string
  hasOverride: boolean
}

// The in-flight keydown listener. Kept OUTSIDE the store (a plain module var, not a
// reactive field) because it is imperative machinery, not display state.
let recordingHandler: ((e: KeyboardEvent) => void) | null = null

// Reactive state for the shortcuts panel. `rows` mirrors the computed keybinding
// display data and `recordingId` marks the row currently capturing a combo; both
// are read directly in the list view's template(), so gea re-renders it when a
// recording starts / stops and after every commit / reset — the ssh.store pattern
// (a bare rev counter read via `void store.rev` is NOT tracked by the gea compiler,
// so the mutated data must be a real reactive field the template actually reads).
// The window keydown capture + the global `recording` flag stay imperative.
class ShortcutsStore extends Store {
  rows: ShortcutRowData[] = []
  recordingId: string | null = null

  reload(): void {
    this.rows = KEYBINDINGS.map((a) => ({
      id: a.id,
      label: a.label,
      combo: comboLabel(effectiveCombo(a.id)),
      hasOverride: !!settings.bindings[a.id]
    }))
  }

  // Begin capturing a new combo for `id`: mark the row recording (re-renders the
  // list to show "Press keys…"), suppress the global shortcut handler, and install
  // a capturing keydown listener that commits / cancels via applyRecordedKey.
  start(id: string): void {
    this.stop()
    this.recordingId = id
    setRecording(true)
    recordingHandler = (e: KeyboardEvent): void => {
      if (applyRecordedKey(id, e) === 'ignore') return
      this.stop()
      this.reload()
    }
    window.addEventListener('keydown', recordingHandler, true)
  }

  stop(): void {
    if (recordingHandler) window.removeEventListener('keydown', recordingHandler, true)
    recordingHandler = null
    this.recordingId = null
    setRecording(false)
  }

  reset(id: string): void {
    makeResetBinding(id, () => this.reload())()
  }
}

const store = new ShortcutsStore()
export default store

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
