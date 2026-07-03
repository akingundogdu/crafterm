import { overlayModal } from '../shared'
import { buildGlobalSearchIndex, makeChoose } from './global-search.state'
import store from './global-search.store'
import GlobalSearchPicker from './global-search.picker'

// Owns the Spotlight global-search overlay: builds the async entry index, opens
// the shared modal, and mounts the gea picker component (GlobalSearchPicker → the
// reactive GlobalSearchList) into it. The list/selection orchestration — search,
// keyboard navigation, highlight — lives in the picker component over the reactive
// global-search.store; row activation comes from state (makeChoose).
export class GlobalSearchController {
  async open(): Promise<void> {
    const entries = await buildGlobalSearchIndex()
    const { modal, close } = overlayModal('picker-modal')
    store.reset()
    new GlobalSearchPicker({ entries, choose: makeChoose(close), close }).render(modal)
    setTimeout(() => (modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus(), 0)
  }
}
