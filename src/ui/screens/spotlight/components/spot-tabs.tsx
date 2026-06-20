// Spotlight tab bar: the WebStorm-style `.spot-tabs` row. Pure DOM — the active
// tab and per-tab shortcut label are injected, so the component carries no
// keybinding/state imports and renders in isolation under happy-dom.

import type { SpotTab, SpotTabsHandle } from './spot-tabs.types'
import { TABS, TAB_ACTION, spotTabClass, makeTabSelect } from './spot-tabs.state'

export type { SpotTab, SpotTabsHandle } from './spot-tabs.types'
export { TABS, TAB_ACTION } from './spot-tabs.state'

export function createSpotTabs(opts: {
  getActive: () => string
  comboFor: (tabId: string) => string | null
  onSelect: (tabId: string) => void
}): SpotTabsHandle {
  const el = (<div class="spot-tabs" />) as HTMLDivElement

  const render = (): void => {
    el.replaceChildren(
      ...TABS.map((t: SpotTab) => {
        const combo = opts.comboFor(t.id)
        return (
          <button
            class={spotTabClass(t.id === opts.getActive())}
            onClick={makeTabSelect(opts.onSelect, t.id)}
          >
            <span class="spot-tab-name">{t.label}</span>
            {combo && <span class="spot-tab-combo">{combo}</span>}
          </button>
        ) as HTMLButtonElement
      })
    )
  }

  return { el, render }
}
