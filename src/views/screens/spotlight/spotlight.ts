import './spotlight.css'
import { createOverlay } from '@views/components/overlay/overlay'
import { makeCloseButton } from '@views/components/dialog/close-button'
import { el } from '@views/lib/dom'
import { buildGlobalSearchIndex, type GsEntry } from '@views/screens/pickers/global-search/global-search'
import { UITexts } from '@texts'
import { effectiveCombo, comboLabel } from '@views/keybindings/keybindings'
import { createSpotTabs, TABS, TAB_ACTION } from './components/spot-tabs'
import { createResultList, type SpotEntry } from './components/result-list'
import {
  BADGE_LABEL,
  buildClaude,
  buildShortcuts,
  buildApps,
  buildProjects,
  buildDailyTasks,
  buildReminders,
  loadFiles,
  loadCommands,
  loadPlans,
  loadBacklog,
  makeSpotlightKeydown
} from './spotlight.state'

// Unified "Search Everywhere" spotlight: one cmd+P surface with WebStorm-style
// tabs (All, Files, Commands, Claude, Terminals, Shortcuts, Plans, Bookmarks,
// Apps, Tasks, Projects, Notebooks, Accounts). Tabs switch via Tab/Shift+Tab,
// a header click, or each tab's own configurable shortcut. Heavy sources (file
// scan, zsh, backlog) load lazily on first activation of their tab.
export async function showSpotlight(initialTab = 'all'): Promise<void> {
  // Plain-DOM overlay+modal (gea §5): mirrors the legacy picker overlayModal —
  // `.modal-overlay` backdrop (backdrop-click close) + a wide spotlight modal.
  const ov = createOverlay({ closeOnBackdrop: true })
  const close = ov.close
  const overlay = ov.overlay
  const modal = el(
    'div',
    { class: 'modal picker-modal picker-modal-wide spotlight-modal' },
    makeCloseButton(close)
  )
  overlay.appendChild(modal)
  ov.mount()

  const input = el('input', {
    class: 'search-box-input',
    type: 'text',
    placeholder: UITexts.Spotlight.searchPlaceholder,
    onInput: () => resultList.setItems(filtered(), activeTab === 'all')
  })
  input.spellcheck = false

  const tabs = createSpotTabs({
    getActive: () => activeTab,
    comboFor: (tabId) => {
      const combo = effectiveCombo(TAB_ACTION[tabId])
      return combo ? comboLabel(combo) : null
    },
    onSelect: (tabId) => {
      void switchTab(tabId)
      input.focus()
    }
  })

  const resultList = createResultList({
    onChoose: (e) => choose(e),
    badgeFor: (source) => BADGE_LABEL[source]
  })

  modal.append(input, tabs.el, resultList.el)

  // The All tab aggregates the cheap, already-in-memory sources. buildGlobalSearchIndex
  // already covers projects/features, panes, bookmarks, accounts, plans, notebooks and
  // the action menus — load it once per open and reuse it for the dedicated tabs.
  const gsIndex = await buildGlobalSearchIndex()
  const mapGs = (entries: GsEntry[]): SpotEntry[] =>
    entries.map((e) => ({ source: e.source, label: e.label, detail: e.detail, run: e.open }))

  const claudeEntries = buildClaude()
  const shortcutEntries = buildShortcuts()
  const appEntries = buildApps()
  const projectEntries = buildProjects()
  const taskEntries = buildDailyTasks().concat(buildReminders())

  // Lazy caches for the heavier sources.
  let filesCache: SpotEntry[] | null = null
  let commandsCache: SpotEntry[] | null = null
  let plansCache: SpotEntry[] | null = null
  let backlogCache: SpotEntry[] | null = null

  async function entriesFor(tab: string): Promise<SpotEntry[]> {
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

  let activeTab = TABS.some((t) => t.id === initialTab) ? initialTab : 'all'
  let current: SpotEntry[] = []
  let loadSeq = 0

  const comboToTab = new Map<string, string>()
  for (const [tab, actionId] of Object.entries(TAB_ACTION)) {
    const combo = effectiveCombo(actionId)
    if (combo) comboToTab.set(combo, tab)
  }

  const filtered = (): SpotEntry[] => {
    const q = input.value.trim().toLowerCase()
    const items = q
      ? current.filter((e) =>
          `${e.label} ${e.detail ?? ''} ${BADGE_LABEL[e.source]}`.toLowerCase().includes(q)
        )
      : current
    return items.slice(0, 200)
  }

  const choose = (e: SpotEntry): void => {
    close()
    e.run()
  }

  const switchTab = async (tab: string): Promise<void> => {
    if (!TABS.some((t) => t.id === tab)) return
    activeTab = tab
    tabs.render()
    const seq = ++loadSeq
    current = []
    resultList.setLoading()
    const entries = await entriesFor(tab)
    if (seq !== loadSeq) return // a newer switch superseded this load
    current = entries
    resultList.setItems(filtered(), activeTab === 'all')
  }

  input.addEventListener(
    'keydown',
    makeSpotlightKeydown({
      close,
      switchTab,
      choose,
      resultList,
      getActiveTab: () => activeTab,
      comboToTab
    })
  )

  tabs.render()
  await switchTab(activeTab)
  setTimeout(() => input.focus(), 0)
}
