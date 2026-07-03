// Barrel for the spotlight tab strip: the TABS list + tab→action map (both DOM-free)
// plus the tab-bar types. The tab bar itself is the gea `SpotTab` Component in
// tab-button.tsx; the reactive `.spot-tabs` strip is composed in spotlight.view.tsx.
export type { SpotTab, SpotTabsHandle } from './spot-tabs.types'
export { TABS, TAB_ACTION } from './spot-tabs.state'
