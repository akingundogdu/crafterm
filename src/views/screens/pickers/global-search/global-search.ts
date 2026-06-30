import './global-search.css'
import { GlobalSearchController } from './global-search.controller'

export type { GsEntry } from './global-search.types'
export { SOURCE_LABEL, buildGlobalSearchIndex } from './global-search.state'

// Spotlight global-search picker view. The list/selection orchestration is
// closure-bound (selection index, highlight, render); the index builder, filter,
// and row activation come from state.
export function showGlobalSearch(): Promise<void> {
  return new GlobalSearchController().open()
}
