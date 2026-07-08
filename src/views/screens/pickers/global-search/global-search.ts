import './global-search.css'
import { overlayModal } from '../shared'
import { buildGlobalSearchIndex, makeChoose } from './global-search.state'
import store from './global-search.store'
import GlobalSearchPicker from './global-search.picker'

export type { GsEntry } from './global-search.types'
export { SOURCE_LABEL, buildGlobalSearchIndex } from './global-search.state'

// ---- Cmd+J: Spotlight global search across every navigable surface -----------
// Builds the async entry index, opens the shared modal, seeds the reactive
// global-search.store, and mounts the gea picker component (GlobalSearchPicker →
// the reactive GlobalSearchList) into it. The list/selection orchestration —
// search, keyboard navigation, highlight — lives in the picker component over the
// store; row activation comes from state (makeChoose).
export async function showGlobalSearch(): Promise<void> {
  const entries = await buildGlobalSearchIndex()
  const { modal, close } = overlayModal('picker-modal')
  store.reset()
  new GlobalSearchPicker({ entries, choose: makeChoose(close), close }).render(modal)
  setTimeout(() => (modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus(), 0)
}
