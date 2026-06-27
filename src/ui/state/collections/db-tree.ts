import type { DbNode } from '@ui/types/types'

// Database tool tree collection — extracted from `settings` (was settings.dbTree).
// Persisted into the single crafterm-state.json; dbConnectionRepo + the database
// screen operate on this array (mutated in place: push/reorder), so the reference
// is stable.
export const dbTree: DbNode[] = []

export function setDbTree(next: DbNode[]): void {
  dbTree.length = 0
  dbTree.push(...next)
}
