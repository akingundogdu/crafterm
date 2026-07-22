import { panes } from '@views/state/spine'
import { persistence } from '@repositories/persistence.service'
import { mountNotePanel } from './note-panel'

// Non-view module for the "Take a note" side panel: its constants, the per-pane
// note read/write (persisted via the debounced save), and the open/close/mount
// orchestration driven by the pane ⋯ menu.

export const NOTE_PANEL_CLASS = 'pane-note'
const NOTE_INPUT_SELECTOR = '.pane-note-input'

export function noteOf(paneId: string): string {
  return panes.get(paneId)?.note ?? ''
}

// Persist the note onto the live pane; the debounced save round-trips it to disk
// (serializeLayout -> SavedLeaf.note) so it survives restarts.
export function writeNote(paneId: string, value: string): void {
  const p = panes.get(paneId)
  if (!p) return
  p.note = value
  persistence.save()
}

export function closeNotePanel(paneId: string): void {
  const p = panes.get(paneId)
  p?.el.querySelector('.' + NOTE_PANEL_CLASS)?.remove()
}

// Opens the note panel for a pane (or focuses its textarea if already open). Never
// mounts a second panel into the same box.
export function openNotePanel(paneId: string): void {
  const p = panes.get(paneId)
  if (!p) return
  const existing = p.el.querySelector<HTMLElement>('.' + NOTE_PANEL_CLASS)
  if (existing) {
    existing.querySelector<HTMLTextAreaElement>(NOTE_INPUT_SELECTOR)?.focus()
    return
  }
  mountNotePanel(p.el, {
    paneId,
    initialValue: noteOf(paneId),
    onInput: (value) => writeNote(paneId, value),
    onClose: () => closeNotePanel(paneId)
  })
}
