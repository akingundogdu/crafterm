import { el } from '@views/lib/dom'
import type { SpotTab } from './spot-tabs.types'
import { spotTabClass, makeTabSelect } from './spot-tabs.state'

// A single `.spot-tab`: the tab name plus an optional shortcut combo. The active
// flag, combo label, and select handler are injected so the button stays
// keybinding/state-free. Plain-DOM `el()` (gea §5) — no JSX, no @ui runtime.
export function createTabButton(opts: {
  tab: SpotTab
  active: boolean
  combo: string | null
  onSelect: (tabId: string) => void
}): HTMLButtonElement {
  const { tab, active, combo, onSelect } = opts
  return el(
    'button',
    { class: spotTabClass(active), onClick: makeTabSelect(onSelect, tab.id) },
    el('span', { class: 'spot-tab-name' }, tab.label),
    combo && el('span', { class: 'spot-tab-combo' }, combo)
  )
}
