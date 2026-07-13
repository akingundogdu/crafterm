import { overlayModal } from '@views/screens/pickers/shared'
import { buildGlobalSearchIndex, type GsEntry } from '@views/screens/pickers/global-search/global-search'
import { effectiveCombo, comboFromEvent } from '@views/keybindings/keybindings'
import { TABS, TAB_ACTION } from './components/spot-tabs'
import type { SpotEntry } from './components/result-list'
import {
  buildClaude,
  buildShortcuts,
  buildApps,
  buildProjects,
  buildDailyTasks,
  buildReminders,
  loadFiles,
  loadCommands,
  loadPlans,
  loadBacklog
} from './spotlight.store'
import { spotlightStore as store, filterSpotEntries } from './spotlight.store'
import SpotlightView, { type SpotlightDeps } from './spotlight.view'

// Unified "Search Everywhere" spotlight: one cmd+P surface with WebStorm-style
// tabs (All, Files, Commands, Claude, Terminals, Shortcuts, Plans, Bookmarks,
// Apps, Tasks, Projects, Notebooks, Accounts). Tabs switch via Tab/Shift+Tab, a
// header click, or each tab's own configurable shortcut. Heavy sources (file
// scan, zsh, backlog) load lazily on first activation of their tab.
//
// The reactive DOM lives in the gea Component tree (spotlight.view.tsx) reading
// spotlight.store; every field the view renders (active tab, entries, query,
// selection, loading) is a real reactive Store field. This entry owns only the
// el-free plumbing: the overlay, the per-open source caches, the load-sequence
// guard, and the keyboard navigation — mutating the store which the reactive body
// patches on. The caches hold SpotEntry values (each with an imperative `run`), so
// they stay plain per-open closure holders rather than reactive Store fields; only
// the currently-displayed slice (store.current) is reactive.
export async function showSpotlight(initialTab = 'all'): Promise<void> {
  const { modal, close } = overlayModal('picker-modal picker-modal-wide spotlight-modal')

  store.reset(TABS.some((t) => t.id === initialTab) ? initialTab : 'all')

  // Per-open source caches, mirroring the legacy open() closure: the cheap
  // in-memory sources build once per open, the heavier ones (file scan, zsh,
  // backlog, plans) load on first activation of their tab.
  let gsIndex: GsEntry[] = []
  let claudeEntries: SpotEntry[] = []
  let shortcutEntries: SpotEntry[] = []
  let appEntries: SpotEntry[] = []
  let projectEntries: SpotEntry[] = []
  let taskEntries: SpotEntry[] = []
  let filesCache: SpotEntry[] | null = null
  let commandsCache: SpotEntry[] | null = null
  let plansCache: SpotEntry[] | null = null
  let backlogCache: SpotEntry[] | null = null

  // Monotonic load token: each tab switch bumps it and captures the value, so a
  // slow async load that resolves after a newer switch is discarded (stale-load
  // guard). A plain closure counter, not a reactive field — the template never
  // reads it.
  let loadSeq = 0

  const comboToTab = new Map<string, string>()
  for (const [tab, actionId] of Object.entries(TAB_ACTION)) {
    const combo = effectiveCombo(actionId)
    if (combo) comboToTab.set(combo, tab)
  }

  const focusInput = (): void => {
    ;(modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  const mapGs = (entries: GsEntry[]): SpotEntry[] =>
    entries.map((e) => ({ source: e.source, label: e.label, detail: e.detail, run: e.open }))

  const entriesFor = async (tab: string): Promise<SpotEntry[]> => {
    switch (tab) {
      case 'all':
        // Files & Commands stay in their own tabs (heavy); Claude panes already
        // appear here as PANE entries, so don't duplicate them. Projects come from
        // buildProjects (runs startup+command on open), not the gsIndex variant.
        return [
          ...mapGs(gsIndex.filter((e) => e.source !== 'project' && e.source !== 'feature')),
          ...projectEntries,
          ...shortcutEntries,
          ...appEntries,
          ...taskEntries
        ]
      case 'files':
        filesCache ??= await loadFiles()
        return filesCache
      case 'commands':
        commandsCache ??= await loadCommands()
        return commandsCache
      case 'claude':
        return claudeEntries
      case 'terminals':
        return mapGs(gsIndex.filter((e) => e.source === 'pane'))
      case 'shortcuts':
        return shortcutEntries
      case 'plans':
        plansCache ??= await loadPlans()
        return plansCache
      case 'bookmarks':
        return mapGs(gsIndex.filter((e) => e.source === 'bookmark'))
      case 'apps':
        return appEntries
      case 'tasks':
        backlogCache ??= await loadBacklog()
        return [...taskEntries, ...backlogCache]
      case 'projects':
        return projectEntries
      case 'notebooks':
        return mapGs(gsIndex.filter((e) => e.source === 'notebook'))
      case 'accounts':
        return mapGs(gsIndex.filter((e) => e.source === 'account'))
      default:
        return []
    }
  }

  const switchTab = async (tab: string): Promise<void> => {
    if (!TABS.some((t) => t.id === tab)) return
    store.setActiveTab(tab)
    const seq = ++loadSeq
    store.setLoading()
    const entries = await entriesFor(tab)
    if (seq !== loadSeq) return // a newer switch superseded this load
    store.setCurrent(entries)
  }

  const choose = (e: SpotEntry): void => {
    close()
    e.run()
  }

  // Keydown: Escape closes; Tab/Shift+Tab cycles tabs; a bound ⌘ combo jumps to its
  // tab; arrows move the selection; Enter chooses (⌘Enter → altRun).
  const onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      close()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const idx = TABS.findIndex((t) => t.id === store.activeTab)
      const next = (idx + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length
      void switchTab(TABS[next].id)
      return
    }
    if (e.metaKey) {
      const tab = comboToTab.get(comboFromEvent(e))
      if (tab) {
        e.preventDefault()
        void switchTab(tab)
        return
      }
    }
    const items = filterSpotEntries(store.current, store.query)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      store.setSel(Math.min(items.length - 1, store.sel + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      store.setSel(Math.max(0, store.sel - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[store.sel]
      if (!item) return
      if (e.metaKey && item.altRun) {
        close()
        item.altRun()
      } else {
        choose(item)
      }
    }
  }

  const deps: SpotlightDeps = {
    onKeyDown: onKey,
    onChoose: choose,
    onHover: (i) => store.setSel(i),
    onSelectTab: (tab) => {
      void switchTab(tab)
      focusInput()
    }
  }
  new SpotlightView(deps).render(modal)

  // The All tab aggregates the cheap, already-in-memory sources. buildGlobalSearchIndex
  // covers projects/features, panes, bookmarks, accounts, plans, notebooks and the
  // action menus — load it once per open and reuse it for the dedicated tabs.
  gsIndex = await buildGlobalSearchIndex()
  claudeEntries = buildClaude()
  shortcutEntries = buildShortcuts()
  appEntries = buildApps()
  projectEntries = buildProjects()
  taskEntries = buildDailyTasks().concat(buildReminders())
  await switchTab(store.activeTab)
  focusInput()
}
