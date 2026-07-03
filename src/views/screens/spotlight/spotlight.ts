import { SpotlightController } from './spotlight.controller'

// Unified "Search Everywhere" spotlight: one cmd+P surface with WebStorm-style
// tabs (All, Files, Commands, Claude, Terminals, Shortcuts, Plans, Bookmarks,
// Apps, Tasks, Projects, Notebooks, Accounts). Tabs switch via Tab/Shift+Tab,
// a header click, or each tab's own configurable shortcut. Heavy sources (file
// scan, zsh, backlog) load lazily on first activation of their tab.
//
// The DOM is a gea Component tree (spotlight.view.tsx) reading spotlight.store; this
// thin entry hands off to the el-free SpotlightController, which owns the overlay,
// the async loads, the selection index, and the keyboard navigation.
export async function showSpotlight(initialTab = 'all'): Promise<void> {
  return new SpotlightController(initialTab).open()
}
