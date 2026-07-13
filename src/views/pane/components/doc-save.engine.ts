import { makeSaveDoc } from '../pane.store'

// Persists the doc's raw text back to its source. Thin wrapper over makeSaveDoc
// (pane.state) so the lifecycle engine depends on a save operation, not on the
// IPC client directly.
export function makeDocSave(source: string, absolute: boolean): (text: string) => void {
  return makeSaveDoc(source, absolute)
}
