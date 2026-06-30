import type { SpotEntry } from './components/result-list'
import type { ResultListHandle } from './components/result-list.types'

// Context the spotlight keydown handler operates on (closure-owned by the view).
export interface SpotlightKeyContext {
  close: () => void
  switchTab: (tab: string) => void
  choose: (e: SpotEntry) => void
  resultList: ResultListHandle
  getActiveTab: () => string
  comboToTab: Map<string, string>
}
