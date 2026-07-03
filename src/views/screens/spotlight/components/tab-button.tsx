import { Component } from '@geajs/core'
import type { SpotTab as SpotTabModel } from './spot-tabs.types'

export interface SpotTabProps {
  tab: SpotTabModel
  active: boolean
  combo: string | null
  onSelect: (tabId: string) => void
}

// A single `.spot-tab`: the tab name plus an optional shortcut combo. Rendered as a
// keyed JSX child of the tab strip, so gea populates `this.props`; the active flag
// is driven by the store's `activeTab` (read in the parent), so gea re-renders the
// tab on every switch — the daily-compact tabs pattern (active via inline
// conditional class).
export default class SpotTab extends Component {
  declare props: SpotTabProps

  template({ tab, active, combo, onSelect }: this['props']) {
    return (
      <button class={'spot-tab' + (active ? ' active' : '')} onClick={() => onSelect(tab.id)}>
        <span class="spot-tab-name">{tab.label}</span>
        {combo ? <span class="spot-tab-combo">{combo}</span> : null}
      </button>
    )
  }
}
