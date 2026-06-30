import type { SpotEntry } from './result-list.types'

// Click handler for a result row: chooses that entry.
export function makeRowChoose(onChoose: (e: SpotEntry) => void, entry: SpotEntry): () => void {
  return () => onChoose(entry)
}

// Clamps a selection index into [0, length-1] (0 when the list is empty).
export function clampSelection(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.max(0, index))
}
