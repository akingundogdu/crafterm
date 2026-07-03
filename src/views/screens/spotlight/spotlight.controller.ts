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
} from './spotlight.state'
import { spotlightStore as store, filterSpotEntries } from './spotlight.store'
import SpotlightView, { type SpotlightDeps } from './spotlight.view'

// The spotlight DOM lives in the gea view Components (spotlight.view.tsx) reading
// spotlight.store; this controller stays el-free and owns the overlay, the async
// source loads, the selection index, and the keyboard navigation, pushing state
// into the store which the reactive body patches on. The lazy caches mirror the
// legacy open() closure: cheap in-memory sources build once per open, the heavier
// sources (file scan, zsh, backlog, plans) load on first activation of their tab.
export class SpotlightController {
  private readonly modal: HTMLElement
  private readonly close: () => void
  private loadSeq = 0

  private gsIndex: GsEntry[] = []
  private claudeEntries: SpotEntry[] = []
  private shortcutEntries: SpotEntry[] = []
  private appEntries: SpotEntry[] = []
  private projectEntries: SpotEntry[] = []
  private taskEntries: SpotEntry[] = []
  private filesCache: SpotEntry[] | null = null
  private commandsCache: SpotEntry[] | null = null
  private plansCache: SpotEntry[] | null = null
  private backlogCache: SpotEntry[] | null = null

  private readonly comboToTab = new Map<string, string>()

  constructor(initialTab: string) {
    const { modal, close } = overlayModal('picker-modal picker-modal-wide spotlight-modal')
    this.modal = modal
    this.close = close

    store.activeTab = TABS.some((t) => t.id === initialTab) ? initialTab : 'all'
    store.current = []
    store.query = ''
    store.sel = 0
    store.loading = true

    for (const [tab, actionId] of Object.entries(TAB_ACTION)) {
      const combo = effectiveCombo(actionId)
      if (combo) this.comboToTab.set(combo, tab)
    }

    const deps: SpotlightDeps = {
      onKeyDown: this.onKey,
      onChoose: this.choose,
      onHover: (i) => store.setSel(i),
      onSelectTab: (tab) => {
        void this.switchTab(tab)
        this.focusInput()
      }
    }
    new SpotlightView(deps).render(modal)
  }

  // The All tab aggregates the cheap, already-in-memory sources. buildGlobalSearchIndex
  // covers projects/features, panes, bookmarks, accounts, plans, notebooks and the
  // action menus — load it once per open and reuse it for the dedicated tabs.
  async open(): Promise<void> {
    this.gsIndex = await buildGlobalSearchIndex()
    this.claudeEntries = buildClaude()
    this.shortcutEntries = buildShortcuts()
    this.appEntries = buildApps()
    this.projectEntries = buildProjects()
    this.taskEntries = buildDailyTasks().concat(buildReminders())
    await this.switchTab(store.activeTab)
    this.focusInput()
  }

  private focusInput(): void {
    ;(this.modal.querySelector('.search-box-input') as HTMLInputElement | null)?.focus()
  }

  private mapGs = (entries: GsEntry[]): SpotEntry[] =>
    entries.map((e) => ({ source: e.source, label: e.label, detail: e.detail, run: e.open }))

  private async entriesFor(tab: string): Promise<SpotEntry[]> {
    switch (tab) {
      case 'all':
        // Files & Commands stay in their own tabs (heavy); Claude panes already
        // appear here as PANE entries, so don't duplicate them. Projects come from
        // buildProjects (runs startup+command on open), not the gsIndex variant.
        return [
          ...this.mapGs(this.gsIndex.filter((e) => e.source !== 'project' && e.source !== 'feature')),
          ...this.projectEntries,
          ...this.shortcutEntries,
          ...this.appEntries,
          ...this.taskEntries
        ]
      case 'files':
        this.filesCache ??= await loadFiles()
        return this.filesCache
      case 'commands':
        this.commandsCache ??= await loadCommands()
        return this.commandsCache
      case 'claude':
        return this.claudeEntries
      case 'terminals':
        return this.mapGs(this.gsIndex.filter((e) => e.source === 'pane'))
      case 'shortcuts':
        return this.shortcutEntries
      case 'plans':
        this.plansCache ??= await loadPlans()
        return this.plansCache
      case 'bookmarks':
        return this.mapGs(this.gsIndex.filter((e) => e.source === 'bookmark'))
      case 'apps':
        return this.appEntries
      case 'tasks':
        this.backlogCache ??= await loadBacklog()
        return [...this.taskEntries, ...this.backlogCache]
      case 'projects':
        return this.projectEntries
      case 'notebooks':
        return this.mapGs(this.gsIndex.filter((e) => e.source === 'notebook'))
      case 'accounts':
        return this.mapGs(this.gsIndex.filter((e) => e.source === 'account'))
      default:
        return []
    }
  }

  private switchTab = async (tab: string): Promise<void> => {
    if (!TABS.some((t) => t.id === tab)) return
    store.setActiveTab(tab)
    const seq = ++this.loadSeq
    store.setLoading()
    const entries = await this.entriesFor(tab)
    if (seq !== this.loadSeq) return // a newer switch superseded this load
    store.setCurrent(entries)
  }

  private choose = (e: SpotEntry): void => {
    this.close()
    e.run()
  }

  // Keydown: Escape closes; Tab/Shift+Tab cycles tabs; a bound ⌘ combo jumps to its
  // tab; arrows move the selection; Enter chooses (⌘Enter → altRun).
  private onKey = (e: KeyboardEvent): void => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      this.close()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      const idx = TABS.findIndex((t) => t.id === store.activeTab)
      const next = (idx + (e.shiftKey ? -1 : 1) + TABS.length) % TABS.length
      void this.switchTab(TABS[next].id)
      return
    }
    if (e.metaKey) {
      const tab = this.comboToTab.get(comboFromEvent(e))
      if (tab) {
        e.preventDefault()
        void this.switchTab(tab)
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
        this.close()
        item.altRun()
      } else {
        this.choose(item)
      }
    }
  }
}
