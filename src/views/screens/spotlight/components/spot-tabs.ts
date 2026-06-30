// Spotlight tab bar: the WebStorm-style `.spot-tabs` row. Pure DOM — the active
// tab and per-tab shortcut label are injected, so the component carries no
// keybinding/state imports and renders in isolation. Plain-DOM `el()` (gea §5).

import { el } from '@views/lib/dom'
import type { SpotTab, SpotTabsHandle } from './spot-tabs.types'
import { TABS, TAB_ACTION } from './spot-tabs.state'
import { createTabButton } from './tab-button'

export type { SpotTab, SpotTabsHandle } from './spot-tabs.types'
export { TABS, TAB_ACTION } from './spot-tabs.state'

export function createSpotTabs(opts: {
  getActive: () => string
  comboFor: (tabId: string) => string | null
  onSelect: (tabId: string) => void
}): SpotTabsHandle {
  const root = el('div', { class: 'spot-tabs' })

  const render = (): void => {
    root.replaceChildren(
      ...TABS.map((t: SpotTab) =>
        createTabButton({
          tab: t,
          active: t.id === opts.getActive(),
          combo: opts.comboFor(t.id),
          onSelect: opts.onSelect
        })
      )
    )
  }

  return { el: root, render }
}
